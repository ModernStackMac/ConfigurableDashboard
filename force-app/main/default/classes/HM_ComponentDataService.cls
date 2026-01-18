/**
 * @description Generic service for executing component data retrieval (SOQL/Apex execution)
 * Handles both SOQL queries and dynamic Apex method invocation for dashboard components
 * 
 * Components use Data Source records (HM_Dashboard_Data_Source__c) to define how data is retrieved.
 * Multiple Data Sources per Component are supported and processed in order.
 * 
 * For Apex method invocation, classes must implement the Callable interface.
 * Admins configure Data Sources on Dashboard Component records.
 * 
 * Example: Create a class that implements Callable:
 * public class MyDataProvider implements Callable {
 *   public Object call(String action, Map<String, Object> args) {
 *     // Handle method calls
 *   }
 * }
 * 
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_ComponentDataService {
  // ==================== CONSTANTS ====================
  private static final String DATA_SOURCE_TYPE_APEX = 'Apex';
  private static final String DATA_SOURCE_TYPE_SOQL = 'SOQL';
  
  private static final String SOQL_KEYWORD_SELECT = 'SELECT';
  private static final String SOQL_KEYWORD_FROM = 'FROM';
  
  private static final Set<String> DML_KEYWORDS = new Set<String>{ 
    'INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'MERGE' 
  };
  
  private static final String MERGE_FIELD_USER_ID = '{!UserId}';
  private static final String MERGE_FIELD_TODAY = '{!Today}';
  private static final String MERGE_FIELD_THIS_MONTH = '{!ThisMonth}';
  
  private static final String APEX_BINDING_USER_ID_PAREN = ':UserInfo\\.getUserId\\(\\)';
  private static final String APEX_BINDING_USER_ID = ':UserInfo\\.getUserId';
  private static final String APEX_BINDING_ORG_ID_PAREN = ':UserInfo\\.getOrganizationId\\(\\)';
  private static final String APEX_BINDING_ORG_ID = ':UserInfo\\.getOrganizationId';
  private static final String APEX_BINDING_DATE_TODAY_PAREN = ':Date\\.today\\(\\)';
  private static final String APEX_BINDING_DATE_TODAY = ':Date\\.today';
  private static final String APEX_BINDING_DATETIME_NOW_PAREN = ':DateTime\\.now\\(\\)';
  private static final String APEX_BINDING_DATETIME_NOW = ':DateTime\\.now';
  
  private static final String CONTEXT_VARIABLE_PREFIX = '{!';
  private static final String CONTEXT_VARIABLE_SUFFIX = '}';
  
  private static final Integer QUERY_PREVIEW_LENGTH = 200;
  
  // ==================== ERROR MESSAGES ====================
  private static final String ERROR_COMPONENT_ID_REQUIRED = 'Component ID is required';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT = 'Insufficient permissions to access Dashboard Component';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_DATA_SOURCE = 'Insufficient permissions to access Dashboard Data Source';
  private static final String ERROR_INVALID_DATA_SOURCE_TYPE = 'Data Source {0}: Invalid Type. Must be "SOQL" or "Apex"';
  private static final String ERROR_APEX_CLASS_NAME_REQUIRED = 'Data Source {0}: Apex Class Name is required when Type is Apex';
  private static final String ERROR_APEX_METHOD_NAME_REQUIRED = 'Data Source {0}: Apex Method Name is required when Type is Apex';
  private static final String ERROR_APEX_CLASS_NOT_FOUND = 'Data Source {0}: Apex class not found: {1}';
  private static final String ERROR_SOQL_QUERY_REQUIRED = 'Data Source {0}: SOQL Query is required when Type is SOQL';
  private static final String ERROR_SOQL_MUST_START_WITH_SELECT = 'Data Source {0}: Invalid SOQL query syntax: Query must start with SELECT';
  private static final String ERROR_SOQL_DML_NOT_ALLOWED = 'Data Source {0}: Invalid SOQL query syntax: DML operations are not allowed';
  private static final String ERROR_SOQL_DUPLICATE_FROM = 'Invalid SOQL query syntax: Query contains {0} FROM clauses. Only one FROM clause is allowed. Example: "SELECT Id FROM Account ORDER BY Name"';
  private static final String ERROR_SOQL_MISSING_FROM = 'Invalid SOQL query syntax: Query must contain a FROM clause';
  private static final String ERROR_APEX_CLASS_NAME_REQUIRED_PUBLIC = 'Apex class name is required';
  private static final String ERROR_APEX_METHOD_NAME_REQUIRED_PUBLIC = 'Apex method name is required';
  private static final String ERROR_CLASS_NOT_FOUND = 'Class not found: {0}';
  private static final String ERROR_EXECUTING_COMPONENT_QUERY = 'Error executing component query: {0}';
  private static final String ERROR_EXECUTING_APEX_METHOD = 'Error executing Apex method: {0}';
  private static final String ERROR_INVALID_SOQL_SYNTAX = 'Invalid SOQL query syntax: {0}. Original Query: {1}. {2}Please check your query for syntax errors such as mismatched parentheses, missing commas, or invalid field references.';
  private static final String ERROR_EXECUTING_SOQL = 'Error executing SOQL query: {0}. Original Query: {1}';
  private static final String ERROR_CLASS_TYPE_NULL = 'Class type is null';
  private static final String ERROR_CALLABLE_INTERFACE_REQUIRED = 'Class must implement Callable interface: {0}. Error: {1}';
  private static final String ERROR_INVOKING_METHOD = 'Error invoking method dynamically: {0}';
  
  /**
   * @description Execute component query (SOQL or Apex) based on Data Source configuration
   * Processes all active Data Sources for the Component in order and combines results
   * @param componentId Component record ID
   * @param context Additional context parameters (recordId, filters, etc.)
   * @return List of Map<String, Object> containing component data from all Data Sources
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> executeComponentQuery(
    Id componentId,
    Map<String, Object> context
  ) {
    // Input validation
    if (componentId == null) {
      throw new AuraHandledException(ERROR_COMPONENT_ID_REQUIRED);
    }
    if (context == null) {
      context = new Map<String, Object>();
    }

    try {
      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Component__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT);
      }

      // Verify component exists and is active
      HM_Dashboard_Component__c component = [
        SELECT Id, HM_Active__c
        FROM HM_Dashboard_Component__c
        WHERE Id = :componentId AND HM_Active__c = TRUE
        LIMIT 1
      ];

      if (component == null) {
        return new List<Map<String, Object>>();
      }

      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_DATA_SOURCE);
      }

      // Query all active Data Sources for this Component, ordered by HM_Order__c
      List<HM_Dashboard_Data_Source__c> dataSources = [
        SELECT
          Id,
          HM_Type__c,
          HM_SOQL_Query__c,
          HM_Apex_Class_Name__c,
          HM_Apex_Method_Name__c,
          HM_Active__c,
          HM_Order__c
        FROM HM_Dashboard_Data_Source__c
        WHERE HM_Dashboard_Component__c = :componentId
          AND HM_Active__c = TRUE
        ORDER BY HM_Order__c ASC NULLS LAST
      ];

      if (dataSources.isEmpty()) {
        // Component has no active Data Sources - return empty list
        return new List<Map<String, Object>>();
      }

      // Process all Data Sources in order and combine results
      List<Map<String, Object>> allResults = new List<Map<String, Object>>();
      
      for (HM_Dashboard_Data_Source__c dataSource : dataSources) {
        List<Map<String, Object>> dataSourceResults = processDataSource(dataSource, context);
        if (!dataSourceResults.isEmpty()) {
          allResults.addAll(dataSourceResults);
        }
      }

      return allResults;
    } catch (AuraHandledException ex) {
      // Re-throw AuraHandledException as-is (already user-friendly)
      throw ex;
    } catch (Exception ex) {
      String errorMsg = String.format(ERROR_EXECUTING_COMPONENT_QUERY, new List<String>{ ex.getMessage() });
      if (ex.getCause() != null) {
        errorMsg += ' (Cause: ' + ex.getCause().getMessage() + ')';
      }
      throw new AuraHandledException(errorMsg);
    }
  }

  /**
   * @description Process a single Data Source and return its results
   * @param dataSource Data Source record to process
   * @param context Context parameters for merge fields and Apex methods
   * @return List of Map<String, Object> containing data from this Data Source
   */
  private static List<Map<String, Object>> processDataSource(
    HM_Dashboard_Data_Source__c dataSource,
    Map<String, Object> context
  ) {
    // Guard clause: validate data source type
    if (dataSource.HM_Type__c != DATA_SOURCE_TYPE_APEX && dataSource.HM_Type__c != DATA_SOURCE_TYPE_SOQL) {
      throw new AuraHandledException(
        String.format(ERROR_INVALID_DATA_SOURCE_TYPE, new List<String>{ String.valueOf(dataSource.Id) })
      );
    }

    // Process Apex type
    if (dataSource.HM_Type__c == DATA_SOURCE_TYPE_APEX) {
      return processApexDataSource(dataSource, context);
    }

    // Process SOQL type
    return processSOQLDataSource(dataSource, context);
  }

  /**
   * @description Process Apex data source
   * @param dataSource Data Source record
   * @param context Context parameters
   * @return List of Map<String, Object> containing data
   */
  private static List<Map<String, Object>> processApexDataSource(
    HM_Dashboard_Data_Source__c dataSource,
    Map<String, Object> context
  ) {
    // Validate Apex configuration
    if (String.isBlank(dataSource.HM_Apex_Class_Name__c)) {
      throw new AuraHandledException(
        String.format(ERROR_APEX_CLASS_NAME_REQUIRED, new List<String>{ String.valueOf(dataSource.Id) })
      );
    }
    if (String.isBlank(dataSource.HM_Apex_Method_Name__c)) {
      throw new AuraHandledException(
        String.format(ERROR_APEX_METHOD_NAME_REQUIRED, new List<String>{ String.valueOf(dataSource.Id) })
      );
    }

    // Validate Apex class exists
    Type classType = Type.forName(dataSource.HM_Apex_Class_Name__c);
    if (classType == null) {
      throw new AuraHandledException(
        String.format(ERROR_APEX_CLASS_NOT_FOUND, new List<String>{ 
          String.valueOf(dataSource.Id), 
          dataSource.HM_Apex_Class_Name__c 
        })
      );
    }

    // Execute Apex method
    return executeApexMethod(
      dataSource.HM_Apex_Class_Name__c,
      dataSource.HM_Apex_Method_Name__c,
      context != null ? context : new Map<String, Object>()
    );
  }

  /**
   * @description Process SOQL data source
   * @param dataSource Data Source record
   * @param context Context parameters
   * @return List of Map<String, Object> containing data
   */
  private static List<Map<String, Object>> processSOQLDataSource(
    HM_Dashboard_Data_Source__c dataSource,
    Map<String, Object> context
  ) {
    // Validate SOQL configuration
    if (String.isBlank(dataSource.HM_SOQL_Query__c)) {
      throw new AuraHandledException(
        String.format(ERROR_SOQL_QUERY_REQUIRED, new List<String>{ String.valueOf(dataSource.Id) })
      );
    }

    // Normalize query to handle line breaks and excessive whitespace
    String normalizedQuery = normalizeSOQLQuery(dataSource.HM_SOQL_Query__c);

    // Basic SOQL validation
    String soqlUpper = normalizedQuery.toUpperCase();
    if (!soqlUpper.startsWith(SOQL_KEYWORD_SELECT)) {
      throw new AuraHandledException(
        String.format(ERROR_SOQL_MUST_START_WITH_SELECT, new List<String>{ String.valueOf(dataSource.Id) })
      );
    }

    // Check for DML keywords
    for (String keyword : DML_KEYWORDS) {
      if (soqlUpper.contains(keyword)) {
        throw new AuraHandledException(
          String.format(ERROR_SOQL_DML_NOT_ALLOWED, new List<String>{ String.valueOf(dataSource.Id) })
        );
      }
    }

    // Validate basic SOQL syntax
    validateSOQLSyntax(normalizedQuery);

    // Execute SOQL query (don't normalize again - already normalized)
    return executeSOQLQuery(normalizedQuery, context, false);
  }

  /**
   * @description Execute SOQL query with merge field replacement
   * @param soqlQuery SOQL query string (may contain merge fields)
   * @param context Context for merge field replacement
   * @param normalizeQuery Whether to normalize the query (default true, set false if already normalized)
   * @return List of Map<String, Object> containing query results
   */
  public static List<Map<String, Object>> executeSOQLQuery(
    String soqlQuery,
    Map<String, Object> context,
    Boolean normalizeQuery
  ) {
    // Input validation
    if (String.isBlank(soqlQuery)) {
      return new List<Map<String, Object>>();
    }
    if (context == null) {
      context = new Map<String, Object>();
    }

    String processedQuery = '';
    try {
      // Normalize query if requested (skip if already normalized)
      String queryToProcess = normalizeQuery != false ? normalizeSOQLQuery(soqlQuery) : soqlQuery;
      
      // Replace merge fields
      processedQuery = replaceMergeFields(queryToProcess, context);

      // Execute query and enforce field-level security
      List<SObject> records = Database.query(processedQuery);
      
      // Strip inaccessible fields for FLS enforcement
      SObjectAccessDecision decision = Security.stripInaccessible(
        AccessType.READABLE,
        records
      );
      List<SObject> accessibleRecords = decision.getRecords();

      // Convert to List<Map<String, Object>>
      List<Map<String, Object>> result = new List<Map<String, Object>>();
      for (SObject record : accessibleRecords) {
        result.add(convertSObjectToMap(record));
      }

      return result;
    } catch (QueryException ex) {
      // Provide more helpful error message with the actual query
      String errorMsg = ex.getMessage();
      String queryPreview = soqlQuery.length() > QUERY_PREVIEW_LENGTH 
        ? soqlQuery.substring(0, QUERY_PREVIEW_LENGTH) + '...' 
        : soqlQuery;
      String processedPreview = String.isNotBlank(processedQuery) && processedQuery.length() > QUERY_PREVIEW_LENGTH 
        ? processedQuery.substring(0, QUERY_PREVIEW_LENGTH) + '...' 
        : processedQuery;
      
      if (errorMsg.contains('unexpected token')) {
        String processedPart = String.isNotBlank(processedPreview) ? 'Processed Query: ' + processedPreview + '. ' : '';
        throw new AuraHandledException(
          String.format(ERROR_INVALID_SOQL_SYNTAX, new List<String>{ 
            errorMsg, 
            queryPreview, 
            processedPart 
          })
        );
      }
      String processedPart = String.isNotBlank(processedPreview) ? '. Processed Query: ' + processedPreview : '';
      throw new AuraHandledException(
        String.format(ERROR_EXECUTING_SOQL, new List<String>{ 
          errorMsg, 
          queryPreview + processedPart 
        })
      );
    } catch (Exception ex) {
      String queryPreview = soqlQuery.length() > QUERY_PREVIEW_LENGTH 
        ? soqlQuery.substring(0, QUERY_PREVIEW_LENGTH) + '...' 
        : soqlQuery;
      throw new AuraHandledException(
        String.format(ERROR_EXECUTING_SOQL, new List<String>{ ex.getMessage(), queryPreview })
      );
    }
  }

  /**
   * @description Execute SOQL query with merge field replacement (overload with default normalize=true)
   * @param soqlQuery SOQL query string (may contain merge fields)
   * @param context Context for merge field replacement
   * @return List of Map<String, Object> containing query results
   */
  public static List<Map<String, Object>> executeSOQLQuery(
    String soqlQuery,
    Map<String, Object> context
  ) {
    return executeSOQLQuery(soqlQuery, context, true);
  }

  /**
   * @description Execute Apex method dynamically
   * @param className Name of the Apex class
   * @param methodName Name of the method to call
   * @param params Parameters to pass to the method
   * @return List of Map<String, Object> from method execution
   */
  public static List<Map<String, Object>> executeApexMethod(
    String className,
    String methodName,
    Map<String, Object> params
  ) {
    // Input validation
    if (String.isBlank(className)) {
      throw new AuraHandledException(ERROR_APEX_CLASS_NAME_REQUIRED_PUBLIC);
    }
    if (String.isBlank(methodName)) {
      throw new AuraHandledException(ERROR_APEX_METHOD_NAME_REQUIRED_PUBLIC);
    }
    if (params == null) {
      params = new Map<String, Object>();
    }

    try {
      // Get Type for the class (already validated in executeComponentQuery)
      Type classType = Type.forName(className);
      if (classType == null) {
        throw new AuraHandledException(
          String.format(ERROR_CLASS_NOT_FOUND, new List<String>{ className })
        );
      }

      // Call the method using Callable interface
      // All classes must implement Callable interface for dynamic invocation
      Object result = callMethodDynamically(classType, methodName, params);

      // Convert result to List<Map<String, Object>>
      List<Map<String, Object>> resultList = convertToResultList(result);

      return resultList;
    } catch (Exception ex) {
      throw new AuraHandledException(
        String.format(ERROR_EXECUTING_APEX_METHOD, new List<String>{ ex.getMessage() })
      );
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * @description Normalize SOQL query by removing line breaks and excessive whitespace
   * Handles queries with \r\n, \n, and multiple spaces to prevent syntax errors
   * @param query Raw SOQL query string
   * @return String Normalized query with single spaces and no line breaks
   * @throws AuraHandledException if query is null (handled by String.isBlank check)
   */
  private static String normalizeSOQLQuery(String query) {
    if (String.isBlank(query)) {
      return query;
    }

    // Replace line breaks with spaces
    String normalized = query.replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ');
    
    // Replace multiple spaces with single space
    normalized = normalized.replaceAll('\\s+', ' ');
    
    // Trim leading and trailing whitespace
    return normalized.trim();
  }

  /**
   * @description Validate SOQL query syntax for common errors
   * Checks for duplicate FROM clauses and missing FROM clause
   * @param query Normalized SOQL query string
   * @throws AuraHandledException if syntax errors are detected
   */
  private static void validateSOQLSyntax(String query) {
    if (String.isBlank(query)) {
      return;
    }

    String queryUpper = query.toUpperCase();
    
    // Count FROM clauses (simple check - count standalone FROM keywords)
    Integer fromCount = 0;
    List<String> words = queryUpper.split('\\s+');
    
    for (String word : words) {
      if (word == SOQL_KEYWORD_FROM) {
        fromCount++;
      }
    }
    
    // Check for duplicate FROM clauses
    if (fromCount > 1) {
      throw new AuraHandledException(
        String.format(ERROR_SOQL_DUPLICATE_FROM, new List<String>{ String.valueOf(fromCount) })
      );
    }
    
    // Check for missing FROM clause
    if (fromCount == 0) {
      throw new AuraHandledException(ERROR_SOQL_MISSING_FROM);
    }
  }

  /**
   * @description Replace merge fields and Apex binding syntax in SOQL query
   * Supported merge fields: {!UserId}, {!Today}, {!ThisMonth}
   * Supports Apex binding syntax: :UserInfo.getUserId(), :UserInfo.getUserId, etc.
   * @param query SOQL query string with merge fields
   * @param context Context map for custom merge fields
   * @return String Query with merge fields replaced
   */
  private static String replaceMergeFields(
    String query,
    Map<String, Object> context
  ) {
    if (String.isBlank(query)) {
      return query;
    }

    String result = query;

    // Pre-compute replacement values for performance
    String userId = '\'' + UserInfo.getUserId() + '\'';
    String orgId = '\'' + UserInfo.getOrganizationId() + '\'';
    String today = String.valueOf(Date.today());
    String thisMonth = String.valueOf(Date.today().toStartOfMonth());
    String now = String.valueOf(Datetime.now());

    // Replace standard merge fields using Map for single-pass efficiency
    Map<String, String> standardReplacements = new Map<String, String>{
      MERGE_FIELD_USER_ID => userId,
      MERGE_FIELD_TODAY => today,
      MERGE_FIELD_THIS_MONTH => thisMonth
    };

    for (String key : standardReplacements.keySet()) {
      result = result.replace(key, standardReplacements.get(key));
    }

    // Replace Apex binding syntax using Map for single-pass efficiency
    Map<String, String> bindingReplacements = new Map<String, String>{
      APEX_BINDING_USER_ID_PAREN => userId,
      APEX_BINDING_USER_ID => userId,
      APEX_BINDING_ORG_ID_PAREN => orgId,
      APEX_BINDING_ORG_ID => orgId,
      APEX_BINDING_DATE_TODAY_PAREN => today,
      APEX_BINDING_DATE_TODAY => today,
      APEX_BINDING_DATETIME_NOW_PAREN => now,
      APEX_BINDING_DATETIME_NOW => now
    };

    for (String pattern : bindingReplacements.keySet()) {
      result = result.replaceAll(pattern, bindingReplacements.get(pattern));
    }

    // Replace context variables
    if (context != null && !context.isEmpty()) {
      for (String key : context.keySet()) {
        Object value = context.get(key);
        if (value == null) {
          continue;
        }

        String replacement;
        if (value instanceof String) {
          replacement = '\'' + String.escapeSingleQuotes((String) value) + '\'';
        } else if (value instanceof Id) {
          replacement = '\'' + (String) value + '\'';
        } else {
          replacement = String.valueOf(value);
        }
        result = result.replace(CONTEXT_VARIABLE_PREFIX + key + CONTEXT_VARIABLE_SUFFIX, replacement);
      }
    }

    return result;
  }

  /**
   * @description Convert SObject to Map<String, Object>
   * Supports parent relationships (single SObject) for fields like Owner.Name
   * Recursively converts nested SObjects to Maps
   * 
   * @param record SObject record to convert
   * @return Map<String, Object> Converted record with parent relationships handled
   *         Always includes Id field if present
   */
  private static Map<String, Object> convertSObjectToMap(SObject record) {
    Map<String, Object> result = new Map<String, Object>();
    Map<String, Object> fields = record.getPopulatedFieldsAsMap();

    for (String fieldName : fields.keySet()) {
      Object value = fields.get(fieldName);
      
      // Handle parent relationships (single SObject)
      if (value instanceof SObject) {
        result.put(fieldName, convertSObjectToMap((SObject) value));
      }
      // Handle primitive values
      else {
        result.put(fieldName, value);
      }
    }

    // Always include Id (even if already in fields map, this ensures it's present)
    if (record.Id != null) {
      result.put('Id', record.Id);
    }

    return result;
  }


  /**
   * @description Call method dynamically using Callable interface pattern
   * All classes must implement Callable interface to be invoked dynamically
   * @param classType Type of the class to instantiate
   * @param methodName Method name to call (passed as 'action' to Callable.call())
   * @param params Parameters to pass to the method
   * @return Object Result from the Callable.call() method
   */
  private static Object callMethodDynamically(
    Type classType,
    String methodName,
    Map<String, Object> params
  ) {
    if (classType == null) {
      throw new AuraHandledException(ERROR_CLASS_TYPE_NULL);
    }

    try {
      // Instantiate the class and cast to Callable
      // This will throw TypeException if class doesn't implement Callable
      Callable callableInstance = (Callable) classType.newInstance();
      
      // Call the method via Callable interface
      // The methodName becomes the 'action' parameter
      return callableInstance.call(methodName, params);
      
    } catch (TypeException ex) {
      // Class doesn't implement Callable interface
      throw new AuraHandledException(
        String.format(ERROR_CALLABLE_INTERFACE_REQUIRED, new List<String>{ 
          classType.getName(), 
          ex.getMessage() 
        })
      );
    } catch (Exception ex) {
      // Other errors (instantiation, method call, etc.)
      String errorMsg = String.format(ERROR_INVOKING_METHOD, new List<String>{ ex.getMessage() });
      if (ex.getCause() != null) {
        errorMsg += ' (Cause: ' + ex.getCause().getMessage() + ')';
      }
      throw new AuraHandledException(errorMsg);
    }
  }


  /**
   * @description Convert method result to List<Map<String, Object>>
   * Handles various return types: List<Map>, List<Object>, Map<String, List>, SObject, null
   * @param result Result object from Apex method call
   * @return List<Map<String, Object>> Converted result list, empty list if result is null or unsupported type
   */
  private static List<Map<String, Object>> convertToResultList(Object result) {
    if (result == null) {
      return new List<Map<String, Object>>();
    }

    if (result instanceof List<Map<String, Object>>) {
      return (List<Map<String, Object>>) result;
    }

    if (result instanceof List<Object>) {
      List<Map<String, Object>> resultList = new List<Map<String, Object>>();
      for (Object item : (List<Object>) result) {
        if (item instanceof Map<String, Object>) {
          resultList.add((Map<String, Object>) item);
        }
      }
      return resultList;
    }

    if (result instanceof Map<String, Object>) {
      return flattenMapOfLists((Map<String, Object>) result);
    }

    // Try to convert to Map if it's an SObject
    if (result instanceof SObject) {
      return new List<Map<String, Object>>{
        convertSObjectToMap((SObject) result)
      };
    }

    // Unexpected result type from Apex method
    return new List<Map<String, Object>>();
  }

  /**
   * @description Flatten a Map<String, List<SObject>> or Map<String, List<Map<String, Object>>> into a single list
   * Used when Apex methods return data organized by object type
   * @param resultMap Map containing lists of records (keys are object type names)
   * @return List<Map<String, Object>> Flattened list of records with object type metadata,
   *         or single record list if map doesn't contain lists
   */
  private static List<Map<String, Object>> flattenMapOfLists(Map<String, Object> resultMap) {
    List<Map<String, Object>> flattenedList = new List<Map<String, Object>>();
    Boolean hasLists = false;
    
    for (String key : resultMap.keySet()) {
      Object value = resultMap.get(key);
      
      if (value == null) {
        continue;
      }
      
      // Handle List<SObject> or List<Object> or List<Map<String, Object>>
      if (value instanceof List<SObject>) {
        List<SObject> sobjectList = (List<SObject>) value;
        if (!sobjectList.isEmpty()) {
          hasLists = true;
          flattenedList.addAll(convertSObjectListToMapList(sobjectList, key));
        }
      } else if (value instanceof List<Object>) {
        List<Object> valueList = (List<Object>) value;
        if (!valueList.isEmpty()) {
          hasLists = true;
          flattenedList.addAll(convertObjectListToMapList(valueList, key));
        }
      }
      // Skip non-list values - they will be handled as single record if no lists found
    }
    
    // If we flattened the map, return the list; otherwise treat as single record
    if (hasLists && !flattenedList.isEmpty()) {
      return flattenedList;
    } else if (hasLists && flattenedList.isEmpty()) {
      // Map had lists but they were empty or couldn't be processed
      return new List<Map<String, Object>>();
    } else {
      // Single Map record (not a map of lists)
      return new List<Map<String, Object>>{ resultMap };
    }
  }

  /**
   * @description Convert a List<SObject> to List<Map<String, Object>> with object type metadata
   * @param sobjectList List of SObjects to convert
   * @param objectType Object type name to add to each record
   * @return List<Map<String, Object>> Converted list with object type metadata
   */
  private static List<Map<String, Object>> convertSObjectListToMapList(List<SObject> sobjectList, String objectType) {
    List<Map<String, Object>> resultList = new List<Map<String, Object>>();
    for (SObject sobj : sobjectList) {
      Map<String, Object> recordMap = convertSObjectToMap(sobj);
      recordMap.put('attributes', new Map<String, Object>{
        'type' => objectType
      });
      recordMap.put('recordType', objectType);
      resultList.add(recordMap);
    }
    return resultList;
  }

  /**
   * @description Convert a List<Object> to List<Map<String, Object>> with object type metadata
   * @param objectList List of Objects (SObject or Map) to convert
   * @param objectType Object type name to add to each record
   * @return List<Map<String, Object>> Converted list with object type metadata
   */
  private static List<Map<String, Object>> convertObjectListToMapList(List<Object> objectList, String objectType) {
    List<Map<String, Object>> resultList = new List<Map<String, Object>>();
    for (Object item : objectList) {
      Map<String, Object> recordMap;
      
      if (item instanceof SObject) {
        // Convert SObject to Map and add object type
        recordMap = convertSObjectToMap((SObject) item);
        recordMap.put('attributes', new Map<String, Object>{
          'type' => objectType
        });
        recordMap.put('recordType', objectType);
        resultList.add(recordMap);
      } else if (item instanceof Map<String, Object>) {
        // Already a Map, just add object type
        recordMap = (Map<String, Object>) item;
        recordMap.put('attributes', new Map<String, Object>{
          'type' => objectType
        });
        recordMap.put('recordType', objectType);
        resultList.add(recordMap);
      }
      // Skip unsupported types (non-SObject, non-Map items) - only SObject and Map are supported
    }
    return resultList;
  }

}