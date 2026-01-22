/**
 * @description Service for executing SOQL queries for dashboard components
 * 
 * Components use Data Source records (HM_Dashboard_Data_Source__c) to define SOQL queries.
 * Multiple Data Sources per Component are supported and processed in order.
 * Supports both standard record queries and aggregate queries.
 * 
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_ComponentDataService {
  // ==================== CONSTANTS ====================
  
  private static final String RETURN_TYPE_AGGREGATE = 'Aggregate';
  private static final String RETURN_TYPE_LIST = 'List';
  
  private static final String SHAPE_AGGREGATE = 'AGGREGATE';
  private static final String SHAPE_LIST = 'LIST';
  
  private static final String COMPONENT_TYPE_TILE = 'Tile';
  private static final String COMPONENT_TYPE_LIST = 'List';
  
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
  private static final String ERROR_SOQL_QUERY_REQUIRED = 'Data Source {0}: SOQL Query is required';
  private static final String ERROR_SOQL_MUST_START_WITH_SELECT = 'Data Source {0}: Invalid SOQL query syntax: Query must start with SELECT';
  private static final String ERROR_SOQL_DML_NOT_ALLOWED = 'Data Source {0}: Invalid SOQL query syntax: DML operations are not allowed';
  private static final String ERROR_SOQL_DUPLICATE_FROM = 'Invalid SOQL query syntax: Query contains {0} FROM clauses. Only one FROM clause is allowed. Example: "SELECT Id FROM Account ORDER BY Name"';
  private static final String ERROR_SOQL_MISSING_FROM = 'Invalid SOQL query syntax: Query must contain a FROM clause';
  private static final String ERROR_EXECUTING_COMPONENT_QUERY = 'Error executing component query: {0}';
  private static final String ERROR_INVALID_SOQL_SYNTAX = 'Invalid SOQL query syntax: {0}. Original Query: {1}. {2}Please check your query for syntax errors such as mismatched parentheses, missing commas, or invalid field references.';
  private static final String ERROR_EXECUTING_SOQL = 'Error executing SOQL query: {0}. Original Query: {1}';
  private static final String ERROR_RETURN_TYPE_INCOMPATIBLE = 'Return type {0} is not compatible with component type {1}';
  private static final String ERROR_RETURN_TYPE_REQUIRED = 'Return type is required for data source';
  private static final String ERROR_OBJECT_NOT_FOUND = 'Object not found: {0}';
  private static final String ERROR_INSUFFICIENT_OBJECT_ACCESS = 'Insufficient permissions to access {0}';
  
  /**
   * @description Execute component query (SOQL or Apex) based on Data Source configuration
   * Processes all active Data Sources for the Component in order and combines results
   * @param componentId Component record ID
   * @param context Additional context parameters (recordId, filters, etc.)
   * @return Map<String, Object> with shape, aggregateValue, rows, etc.
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> executeComponentQuery(
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

      // Verify component exists and is active, get component type and showAllRecordsFilter setting
      List<String> componentFields = new List<String>{ 'Id', 'HM_Active__c', 'HM_Type__c' };
      
      // Check if HM_Show_All_Records_Filter__c exists and is accessible
      try {
        Schema.DescribeFieldResult showAllRecordsFilterField = Schema.sObjectType.HM_Dashboard_Component__c
          .fields.HM_Show_All_Records_Filter__c;
        if (showAllRecordsFilterField.isAccessible()) {
          componentFields.add('HM_Show_All_Records_Filter__c');
        }
      } catch (SObjectException ex) {
        // Graceful degradation: field doesn't exist - skip it
      }
      
      String componentQuery = 'SELECT ' + String.join(componentFields, ', ') + 
        ' FROM HM_Dashboard_Component__c' +
        ' WHERE Id = :componentId AND HM_Active__c = TRUE' +
        ' LIMIT 1';
      
      List<HM_Dashboard_Component__c> components = Database.query(componentQuery);
      HM_Dashboard_Component__c component = components.isEmpty() ? null : components[0];

      if (component == null) {
        return buildEmptyResponse();
      }

      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_DATA_SOURCE);
      }

      // Query all active Data Sources for this Component, ordered by HM_Order__c
      List<HM_Dashboard_Data_Source__c> dataSources = [
        SELECT
          Id,
          Name,
          HM_SOQL_Query__c,
          HM_Return_Type__c,
          HM_Active__c,
          HM_Order__c,
          HM_Row_Icon_Name__c
        FROM HM_Dashboard_Data_Source__c
        WHERE HM_Dashboard_Component__c = :componentId
          AND HM_Active__c = TRUE
        ORDER BY HM_Order__c ASC NULLS LAST
      ];

      if (dataSources.isEmpty()) {
        // Component has no active Data Sources - return empty response
        return buildEmptyResponse();
      }

      // Query Component Detail Maps with Map Type "Subtitle" and "Tile Badge" for tile components
      HM_Component_Detail_Map__c subtitleDetailMap = null;
      HM_Component_Detail_Map__c badgeDetailMap = null;
      if (component.HM_Type__c == COMPONENT_TYPE_TILE) {
        // Check object accessibility for Component Detail Maps
        if (Schema.sObjectType.HM_Component_Detail_Map__c.isAccessible()) {
          // Query subtitle detail map
          List<HM_Component_Detail_Map__c> subtitleMaps = [
            SELECT
              Id,
              HM_Data_Source_Name__c,
              HM_Field_API_Name__c,
              HM_Format_Type__c
            FROM HM_Component_Detail_Map__c
            WHERE HM_Dashboard_Component__c = :componentId
              AND HM_Map_Type__c = 'Subtitle'
            LIMIT 1
          ];
          if (!subtitleMaps.isEmpty()) {
            subtitleDetailMap = subtitleMaps[0];
          }
          
          // Query badge detail map
          List<HM_Component_Detail_Map__c> badgeMaps = [
            SELECT
              Id,
              HM_Data_Source_Name__c,
              HM_Field_API_Name__c,
              HM_Format_Type__c
            FROM HM_Component_Detail_Map__c
            WHERE HM_Dashboard_Component__c = :componentId
              AND HM_Map_Type__c = 'Tile Badge'
            LIMIT 1
          ];
          if (!badgeMaps.isEmpty()) {
            badgeDetailMap = badgeMaps[0];
          }
        }
      }

      // Check if showAllRecordsFilter is enabled (for automatic standard field injection)
      Boolean showAllRecordsFilter = false;
      try {
        showAllRecordsFilter = (Boolean) component.get('HM_Show_All_Records_Filter__c');
        if (showAllRecordsFilter == null) {
          showAllRecordsFilter = false;
        }
      } catch (SObjectException ex) {
        // Graceful degradation: field doesn't exist - default to false
        showAllRecordsFilter = false;
      }
      
      // Add component setting to context for use in query enhancement
      if (context == null) {
        context = new Map<String, Object>();
      }
      context.put('showAllRecordsFilter', showAllRecordsFilter);
      context.put('componentId', componentId);

      // Process all data sources and combine results
      // For List components: combine all LIST sources
      // For Tile components: use first AGGREGATE or first LIST source
      Map<String, Object> mainResponse;
      if (component.HM_Type__c == COMPONENT_TYPE_LIST) {
        mainResponse = processMultipleDataSourcesForList(dataSources, context, component.HM_Type__c);
      } else {
        // Tile component - process first data source only
        if (dataSources.isEmpty()) {
          return buildEmptyResponse();
        }
        mainResponse = processDataSource(dataSources[0], context, component.HM_Type__c);
        
        // Process subtitle data source if different from main data source
        if (subtitleDetailMap != null) {
          String subtitleValue = processSubtitleDataSource(
            subtitleDetailMap,
            dataSources,
            context,
            component.HM_Type__c
          );
          if (subtitleValue != null) {
            mainResponse.put('subtitleValue', subtitleValue);
          }
        }
        
        // Process badge data source if different from main data source
        if (badgeDetailMap != null) {
          String badgeValue = processBadgeDataSource(
            badgeDetailMap,
            dataSources,
            context,
            component.HM_Type__c
          );
          if (badgeValue != null) {
            mainResponse.put('badgeValue', badgeValue);
          }
        }
      }

      return mainResponse;
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
   * @param context Context parameters for merge fields
   * @param componentType Component type (Tile, List, etc.) for validation
   * @return Map<String, Object> with shape, aggregateValue, rows, etc.
   */
  private static Map<String, Object> processDataSource(
    HM_Dashboard_Data_Source__c dataSource,
    Map<String, Object> context,
    String componentType
  ) {
    // Validate return type is set
    if (String.isBlank(dataSource.HM_Return_Type__c)) {
      throw new AuraHandledException(ERROR_RETURN_TYPE_REQUIRED);
    }

    // Validate return type is compatible with component type
    validateReturnType(dataSource.HM_Return_Type__c, componentType);

    // Process SOQL query
    return processSOQLDataSource(dataSource, context, componentType);
  }

  /**
   * @description Process SOQL data source
   * @param dataSource Data Source record
   * @param context Context parameters
   * @param componentType Component type for validation
   * @return Map<String, Object> with shape, aggregateValue, rows, etc.
   */
  private static Map<String, Object> processSOQLDataSource(
    HM_Dashboard_Data_Source__c dataSource,
    Map<String, Object> context,
    String componentType
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

    // Validate object-level access (CRUD check)
    validateObjectAccess(normalizedQuery);

    // Enhance query with standard fields if showAllRecordsFilter is enabled
    String enhancedQuery = normalizedQuery;
    if (context != null && context.containsKey('showAllRecordsFilter')) {
      Boolean showAllRecordsFilter = (Boolean) context.get('showAllRecordsFilter');
      if (showAllRecordsFilter == true) {
        enhancedQuery = enhanceSOQLWithStandardFields(normalizedQuery);
      }
    }

    // Execute SOQL query (don't normalize again - already normalized)
    Map<String, Object> response = executeSOQLQuery(enhancedQuery, context, false, dataSource.HM_Return_Type__c);
    
    // Add data source icon to rows if present
    addDataSourceIconToRows(response, dataSource);
    
    return response;
  }

  /**
   * @description Execute SOQL query with merge field replacement
   * @param soqlQuery SOQL query string (may contain merge fields)
   * @param context Context for merge field replacement
   * @param normalizeQuery Whether to normalize the query (default true, set false if already normalized)
   * @param returnType Expected return type (Aggregate, List)
   * @return Map<String, Object> with shape, aggregateValue, rows, etc.
   */
  public static Map<String, Object> executeSOQLQuery(
    String soqlQuery,
    Map<String, Object> context,
    Boolean normalizeQuery,
    String returnType
  ) {
    // Input validation
    if (String.isBlank(soqlQuery)) {
      return buildEmptyResponse();
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

      // Execute query
      List<SObject> records = Database.query(processedQuery);
      
      // Process based on return type
      if (returnType == RETURN_TYPE_AGGREGATE) {
        // For aggregate queries, results are AggregateResult which cannot use Security.stripInaccessible()
        // Aggregate queries already respect data access through WHERE clauses
        if (!records.isEmpty() && records[0] instanceof AggregateResult) {
          AggregateResult ar = (AggregateResult) records[0];
          Map<String, Object> fields = ar.getPopulatedFieldsAsMap();
          
          // Try "totalWon" alias first, then first key
          Object value = fields.containsKey('totalWon') 
            ? fields.get('totalWon') 
            : fields.values()[0];
          
          // If numeric and null, return 0
          if (value == null) {
            value = 0;
          }
          
          return buildAggregateResponse(value);
        } else {
          throw new AuraHandledException('Aggregate return type requires aggregate query');
        }
      } else if (returnType == RETURN_TYPE_LIST) {
        // For LIST return type, check if results are AggregateResult
        if (!records.isEmpty() && records[0] instanceof AggregateResult) {
          // AggregateResult cannot use Security.stripInaccessible()
          // Aggregate queries already respect data access through WHERE clauses
          List<AggregateResult> aggregateList = new List<AggregateResult>();
          for (SObject record : records) {
            aggregateList.add((AggregateResult) record);
          }
          return buildListResponseFromAggregate(aggregateList);
        } else {
          // Regular SObject queries - enforce field-level security
          SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.READABLE,
            records
          );
          List<SObject> accessibleRecords = decision.getRecords();
          
          List<Map<String, Object>> rows = new List<Map<String, Object>>();
          for (SObject record : accessibleRecords) {
            rows.add(convertSObjectToMap(record));
          }
          return buildListResponse(rows);
        }
      } else {
        throw new AuraHandledException('Invalid return type: ' + returnType);
      }
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


  // ==================== HELPER METHODS ====================

  /**
   * @description Validate object-level access for the queried object
   * Extracts the object name from the SOQL query and checks if user has read access
   * @param normalizedQuery Normalized SOQL query string
   * @throws AuraHandledException if object is not found or user lacks access
   */
  private static void validateObjectAccess(String normalizedQuery) {
    String objectName = extractObjectNameFromQuery(normalizedQuery);
    if (String.isBlank(objectName)) {
      // Could not determine object - let query execution handle any errors
      return;
    }

    // Validate object exists and is accessible
    Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectName);
    if (sObjType == null) {
      throw new AuraHandledException(
        String.format(ERROR_OBJECT_NOT_FOUND, new List<String>{ objectName })
      );
    }
    if (!sObjType.getDescribe().isAccessible()) {
      throw new AuraHandledException(
        String.format(ERROR_INSUFFICIENT_OBJECT_ACCESS, new List<String>{ objectName })
      );
    }
    // Field-level security is enforced via Security.stripInaccessible() during query execution
  }

  /**
   * @description Extract the object API name from a SOQL query
   * Handles standard queries like "SELECT Id FROM Account WHERE..."
   * @param normalizedQuery Normalized SOQL query string
   * @return String Object API name, or null if cannot be determined
   */
  private static String extractObjectNameFromQuery(String normalizedQuery) {
    if (String.isBlank(normalizedQuery)) {
      return null;
    }

    String queryUpper = normalizedQuery.toUpperCase();
    Integer fromIndex = queryUpper.indexOf(' FROM ');
    if (fromIndex < 0) {
      return null;
    }

    // Extract everything after FROM
    String afterFrom = normalizedQuery.substring(fromIndex + 6).trim();
    
    // Object name is the first token (ends at space, WHERE, ORDER, LIMIT, GROUP, etc.)
    Integer endIndex = afterFrom.length();
    for (String delimiter : new List<String>{' ', '\t', '\n'}) {
      Integer delimIndex = afterFrom.indexOf(delimiter);
      if (delimIndex > 0 && delimIndex < endIndex) {
        endIndex = delimIndex;
      }
    }
    
    String objectName = afterFrom.substring(0, endIndex).trim();
    return String.isNotBlank(objectName) ? objectName : null;
  }

  /**
   * @description Enhance SOQL query with standard fields if they're missing
   * Automatically injects Id, Name, CreatedDate, LastModifiedDate if not already present
   * Used when showAllRecordsFilter is enabled to ensure common columns are available
   * @param query Normalized SOQL query string
   * @return String Enhanced query with standard fields added if missing
   */
  private static String enhanceSOQLWithStandardFields(String query) {
    if (String.isBlank(query)) {
      return query;
    }

    // Standard fields to ensure are present (exist on all standard objects)
    // Note: Id is almost always present, but we check for all to be safe
    Set<String> standardFields = new Set<String>{ 'Id', 'Name', 'CreatedDate', 'LastModifiedDate' };
    
    // Parse SELECT clause (everything between SELECT and FROM)
    String queryUpper = query.toUpperCase();
    Integer selectIndex = queryUpper.indexOf('SELECT');
    Integer fromIndex = queryUpper.indexOf(' FROM');
    
    if (selectIndex < 0 || fromIndex < 0 || fromIndex <= selectIndex) {
      // Invalid query structure - return as-is to avoid breaking query
      return query;
    }
    
    // Check for complex queries (subqueries, aggregate functions) - skip enhancement to be safe
    // Simple check: if SELECT contains parentheses (likely subquery or function), skip
    String selectClauseOriginal = query.substring(selectIndex + 6, fromIndex).trim();
    if (selectClauseOriginal.contains('(') || selectClauseOriginal.contains(')')) {
      // Likely contains functions or subqueries - return as-is to avoid breaking
      return query;
    }
    
    // Extract SELECT clause and rest of query
    String selectClause = selectClauseOriginal;
    String restOfQuery = query.substring(fromIndex);
    
    // Parse fields from SELECT clause (handle commas, whitespace, case-insensitive)
    Set<String> existingFields = new Set<String>();
    List<String> fieldList = new List<String>();
    
    // Split by comma and process each field
    List<String> parts = selectClause.split(',');
    for (String part : parts) {
      String field = part.trim();
      if (String.isNotBlank(field)) {
        // Remove any alias (AS keyword) for comparison
        String fieldName = field;
        Integer asIndex = field.toUpperCase().indexOf(' AS ');
        if (asIndex > 0) {
          fieldName = field.substring(0, asIndex).trim();
        }
        
        // Handle relationship fields (Account.Name) - extract just the field name
        // For standard fields, we check the base name (e.g., "Name" from "Account.Name")
        String baseFieldName = fieldName;
        if (fieldName.contains('.')) {
          List<String> fieldParts = fieldName.split('\\.');
          baseFieldName = fieldParts[fieldParts.size() - 1]; // Get last part
        }
        
        // Store original field (with alias if present)
        fieldList.add(field);
        // Store base field name for comparison (case-insensitive)
        existingFields.add(baseFieldName.toUpperCase());
      }
    }
    
    // Add missing standard fields (only if not already present)
    for (String standardField : standardFields) {
      if (!existingFields.contains(standardField.toUpperCase())) {
        fieldList.add(standardField);
      }
    }
    
    // Rebuild query with enhanced SELECT clause
    String enhancedSelectClause = String.join(fieldList, ', ');
    return 'SELECT ' + enhancedSelectClause + restOfQuery;
  }

  /**
   * @description Normalize SOQL query by removing line breaks and excessive whitespace
   * Handles queries with \r\n, \n, and multiple spaces to prevent syntax errors
   * @param query Raw SOQL query string
   * @return String Normalized query with single spaces and no line breaks
   */
  private static String normalizeSOQLQuery(String query) {
    if (String.isBlank(query)) {
      return query;
    }

    // Replace all whitespace (line breaks, tabs, multiple spaces) with single space in one pass
    String normalized = query.replaceAll('\\s+', ' ');
    
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
   * Escapes string values to prevent SOQL injection
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
   * @param record SObject record to convert
   * @return Map<String, Object> Map representation of the SObject, always includes Id field if present
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


  // ==================== RESPONSE BUILDING METHODS ====================

  /**
   * @description Build empty response map
   * @return Map<String, Object> Empty response with success=false
   */
  private static Map<String, Object> buildEmptyResponse() {
    return new Map<String, Object>{
      'success' => false,
      'shape' => SHAPE_LIST,
      'aggregateValue' => null,
      'aggregateType' => null,
      'rows' => new List<Map<String, Object>>(),
      'errorMessage' => null
    };
  }

  /**
   * @description Build aggregate response
   * @param value Aggregate value (Decimal, Integer, String, Boolean, Date, Datetime)
   * @return Map<String, Object> Response with AGGREGATE shape
   */
  private static Map<String, Object> buildAggregateResponse(Object value) {
    return new Map<String, Object>{
      'success' => true,
      'shape' => SHAPE_AGGREGATE,
      'aggregateValue' => value,
      'aggregateType' => determineAggregateType(value),
      'rows' => null,
      'errorMessage' => null
    };
  }

  /**
   * @description Build aggregate response from AggregateResult
   * @param ar AggregateResult to extract value from
   * @return Map<String, Object> Response with AGGREGATE shape
   */
  private static Map<String, Object> buildAggregateResponseFromAggregate(AggregateResult ar) {
    Map<String, Object> fields = ar.getPopulatedFieldsAsMap();
    
    // Try "totalWon" alias first, then first key
    Object value = fields.containsKey('totalWon') 
      ? fields.get('totalWon') 
      : fields.values()[0];
    
    // If null, return 0
    if (value == null) {
      value = 0;
    }
    
    return buildAggregateResponse(value);
  }

  /**
   * @description Build list response
   * @param rows List of Map<String, Object> rows
   * @return Map<String, Object> Response with LIST shape
   */
  private static Map<String, Object> buildListResponse(List<Map<String, Object>> rows) {
    return new Map<String, Object>{
      'success' => true,
      'shape' => SHAPE_LIST,
      'aggregateValue' => null,
      'aggregateType' => null,
      'rows' => rows,
      'errorMessage' => null
    };
  }

  /**
   * @description Build list response from AggregateResult
   * @param arList List of AggregateResult to convert
   * @return Map<String, Object> Response with LIST shape
   */
  private static Map<String, Object> buildListResponseFromAggregate(List<AggregateResult> arList) {
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    
    for (AggregateResult ar : arList) {
      Map<String, Object> row = new Map<String, Object>();
      Map<String, Object> fields = ar.getPopulatedFieldsAsMap();
      
      for (String key : fields.keySet()) {
        row.put(key, fields.get(key));
      }
      
      // Add synthetic Id if not present
      if (!row.containsKey('Id')) {
        row.put('Id', 'aggregate-' + rows.size());
      }
      
      rows.add(row);
    }
    
    return buildListResponse(rows);
  }


  /**
   * @description Validate return type is compatible with component type
   * @param returnType Return type value (Aggregate, List)
   * @param componentType Component type (Tile, List)
   * @throws AuraHandledException if incompatible
   */
  private static void validateReturnType(String returnType, String componentType) {
    if (componentType == COMPONENT_TYPE_TILE) {
      if (returnType != RETURN_TYPE_AGGREGATE && returnType != RETURN_TYPE_LIST) {
        throw new AuraHandledException(
          String.format(ERROR_RETURN_TYPE_INCOMPATIBLE, new List<String>{ returnType, componentType })
        );
      }
    } else if (componentType == COMPONENT_TYPE_LIST) {
      if (returnType != RETURN_TYPE_LIST) {
        throw new AuraHandledException(
          String.format(ERROR_RETURN_TYPE_INCOMPATIBLE, new List<String>{ returnType, componentType })
        );
      }
    }
  }

  /**
   * @description Determine aggregate type string from value
   * @param value Aggregate value
   * @return String Type string (DECIMAL, INTEGER, STRING, BOOLEAN, DATE, DATETIME)
   */
  private static String determineAggregateType(Object value) {
    if (value instanceof Decimal) {
      return 'DECIMAL';
    } else if (value instanceof Integer) {
      return 'INTEGER';
    } else if (value instanceof String) {
      return 'STRING';
    } else if (value instanceof Boolean) {
      return 'BOOLEAN';
    } else if (value instanceof Date) {
      return 'DATE';
    } else if (value instanceof Datetime) {
      return 'DATETIME';
    }
    return 'STRING';
  }

  /**
   * @description Process multiple data sources for List components
   * Combines LIST sources into a single LIST response
   * @param dataSources List of data sources to process
   * @param context Context parameters
   * @param componentType Component type (should be List)
   * @return Map<String, Object> Combined response
   */
  private static Map<String, Object> processMultipleDataSourcesForList(
    List<HM_Dashboard_Data_Source__c> dataSources,
    Map<String, Object> context,
    String componentType
  ) {
    if (dataSources == null || dataSources.isEmpty()) {
      return buildEmptyResponse();
    }
    
    List<Map<String, Object>> allRows = new List<Map<String, Object>>();

    for (HM_Dashboard_Data_Source__c dataSource : dataSources) {
      Map<String, Object> response = processDataSource(dataSource, context, componentType);
      
      if (response == null || response.get('success') != true) {
        continue;
      }
      
      String shape = (String) response.get('shape');
      if (shape != SHAPE_LIST) {
        continue;
      }
      
      List<Map<String, Object>> rows = (List<Map<String, Object>>) response.get('rows');
      if (rows != null && !rows.isEmpty()) {
        allRows.addAll(rows);
      }
    }

    return allRows.isEmpty() ? buildEmptyResponse() : buildListResponse(allRows);
  }

  /**
   * @description Find data source by name or return first available
   * @param dataSources List of data sources to search
   * @param dataSourceName Optional name to search for
   * @return HM_Dashboard_Data_Source__c Found data source or null if list is empty
   */
  private static HM_Dashboard_Data_Source__c findDataSourceByName(
    List<HM_Dashboard_Data_Source__c> dataSources,
    String dataSourceName
  ) {
    if (dataSources == null || dataSources.isEmpty()) {
      return null;
    }
    
    if (String.isNotBlank(dataSourceName)) {
      for (HM_Dashboard_Data_Source__c ds : dataSources) {
        if (ds.Name == dataSourceName) {
          return ds;
        }
      }
    }
    
    return dataSources[0];
  }

  /**
   * @description Add data source icon to rows in response if icon is configured
   * @param response Response map that may contain rows
   * @param dataSource Data source record with icon configuration
   */
  private static void addDataSourceIconToRows(
    Map<String, Object> response,
    HM_Dashboard_Data_Source__c dataSource
  ) {
    if (response == null || dataSource == null) {
      return;
    }
    
    String shape = (String) response.get('shape');
    if (shape != SHAPE_LIST) {
      return;
    }
    
    String rowIconName = getFieldValueSafely(dataSource, 'HM_Row_Icon_Name__c');
    if (String.isBlank(rowIconName)) {
      return;
    }
    
    List<Map<String, Object>> rows = (List<Map<String, Object>>) response.get('rows');
    if (rows == null || rows.isEmpty()) {
      return;
    }
    
    for (Map<String, Object> row : rows) {
      row.put('dataSourceIcon', rowIconName);
    }
  }

  /**
   * @description Safely get field value from SObject, returning null if field doesn't exist
   * @param record SObject to get field from
   * @param fieldName API name of field
   * @return String Field value, or null if field doesn't exist or is not accessible
   */
  private static String getFieldValueSafely(SObject record, String fieldName) {
    if (record == null || String.isBlank(fieldName)) {
      return null;
    }
    
    try {
      return (String) record.get(fieldName);
    } catch (SObjectException ex) {
      // Graceful degradation: field doesn't exist or not accessible
      return null;
    }
  }

  /**
   * @description Process subtitle data source and extract/formatted value
   * @param subtitleDetailMap Component Detail Map with Map Type "Subtitle"
   * @param dataSources List of all data sources for the component
   * @param context Context parameters for merge fields and Apex methods
   * @param componentType Component type for validation
   * @return String Formatted subtitle value, or null if processing fails
   */
  private static String processSubtitleDataSource(
    HM_Component_Detail_Map__c subtitleDetailMap,
    List<HM_Dashboard_Data_Source__c> dataSources,
    Map<String, Object> context,
    String componentType
  ) {
    if (dataSources == null || dataSources.isEmpty() || subtitleDetailMap == null) {
      return null;
    }
    
    try {
      HM_Dashboard_Data_Source__c subtitleDataSource = findDataSourceByName(
        dataSources,
        subtitleDetailMap.HM_Data_Source_Name__c
      );
      
      if (subtitleDataSource == null) {
        return null;
      }
      
      // Process the subtitle data source
      Map<String, Object> subtitleResponse = processDataSource(
        subtitleDataSource,
        context,
        componentType
      );
      
      if (subtitleResponse == null || subtitleResponse.get('success') != true) {
        return null;
      }
      
      // Extract raw value from response
      Object rawValue = extractValueFromResponse(
        subtitleResponse,
        subtitleDetailMap.HM_Field_API_Name__c
      );
      
      // Format the value using format type from detail map
      if (rawValue != null) {
        return formatSubtitleValue(rawValue, subtitleDetailMap.HM_Format_Type__c);
      }
      
      return null;
    } catch (AuraHandledException ex) {
      throw ex;
    } catch (Exception ex) {
      return null;
    }
  }

  /**
   * @description Process badge data source and extract/formatted value
   * @param badgeDetailMap Component Detail Map with Map Type "Tile Badge"
   * @param dataSources List of all data sources for the component
   * @param context Context parameters for merge fields and Apex methods
   * @param componentType Component type for validation
   * @return String Formatted badge value, or null if processing fails
   */
  private static String processBadgeDataSource(
    HM_Component_Detail_Map__c badgeDetailMap,
    List<HM_Dashboard_Data_Source__c> dataSources,
    Map<String, Object> context,
    String componentType
  ) {
    if (dataSources == null || dataSources.isEmpty() || badgeDetailMap == null) {
      return null;
    }
    
    try {
      HM_Dashboard_Data_Source__c badgeDataSource = findDataSourceByName(
        dataSources,
        badgeDetailMap.HM_Data_Source_Name__c
      );
      
      if (badgeDataSource == null) {
        return null;
      }
      
      // Process the badge data source
      Map<String, Object> badgeResponse = processDataSource(
        badgeDataSource,
        context,
        componentType
      );
      
      if (badgeResponse == null || badgeResponse.get('success') != true) {
        return null;
      }
      
      // Extract raw value from response
      Object rawValue = extractValueFromResponse(
        badgeResponse,
        badgeDetailMap.HM_Field_API_Name__c
      );
      
      // Return raw numeric value as string (not formatted) so frontend can determine direction
      // Frontend will format it after determining direction
      if (rawValue != null) {
        // Convert to string representation of number
        if (rawValue instanceof Decimal || rawValue instanceof Integer || rawValue instanceof Double) {
          return String.valueOf(rawValue);
        } else if (rawValue instanceof String) {
          // Try to parse as number
          try {
            Decimal numValue = Decimal.valueOf((String) rawValue);
            return String.valueOf(numValue);
          } catch (Exception ex) {
            // If can't parse, return as-is
            return (String) rawValue;
          }
        } else {
          return String.valueOf(rawValue);
        }
      }
      
      return null;
    } catch (AuraHandledException ex) {
      throw ex;
    } catch (Exception ex) {
      return null;
    }
  }

  /**
   * @description Extract value from component response based on shape
   * Handles both AGGREGATE and LIST response shapes
   * @param response Response map from processDataSource
   * @param fieldApiName Optional field API name to extract from first row (for LIST shape)
   * @return Object Extracted raw value, or null if not found
   */
  private static Object extractValueFromResponse(
    Map<String, Object> response,
    String fieldApiName
  ) {
    if (response == null) {
      return null;
    }
    
    String shape = (String) response.get('shape');
    
    if (shape == SHAPE_AGGREGATE) {
      return response.get('aggregateValue');
    }
    
    if (shape != SHAPE_LIST) {
      return null;
    }
    
    List<Map<String, Object>> rows = (List<Map<String, Object>>) response.get('rows');
    if (rows == null || rows.isEmpty()) {
      return null;
    }
    
    Map<String, Object> firstRow = rows[0];
    
    if (String.isNotBlank(fieldApiName)) {
      return extractNestedFieldValue(firstRow, fieldApiName);
    }
    
    if (firstRow.containsKey('expr0')) {
      return firstRow.get('expr0');
    }
    
    if (firstRow.containsKey('totalWon')) {
      return firstRow.get('totalWon');
    }
    
    for (String key : firstRow.keySet()) {
      if (key != 'Id') {
        return firstRow.get(key);
      }
    }
    
    return null;
  }

  /**
   * @description Extract nested field value from map using dot notation
   * @param dataMap Map containing field values
   * @param fieldPath Field path (supports dot notation like "Account.Name")
   * @return Object Field value or null if not found
   */
  private static Object extractNestedFieldValue(Map<String, Object> dataMap, String fieldPath) {
    if (dataMap == null || String.isBlank(fieldPath)) {
      return null;
    }
    
    String[] parts = fieldPath.split('\\.');
    Object value = dataMap;
    
    for (String part : parts) {
      if (!(value instanceof Map<String, Object>)) {
        return null;
      }
      
      Map<String, Object> nestedMap = (Map<String, Object>) value;
      value = nestedMap.get(part);
      
      if (value == null) {
        return null;
      }
    }
    
    return value;
  }

  /**
   * @description Format subtitle value based on format type
   * @param value Raw value to format
   * @param formatType Format type (Currency, Number, Percent, Date, etc.)
   * @return String Formatted value string
   */
  private static String formatSubtitleValue(Object value, String formatType) {
    if (value == null) {
      // Return "0" for numeric types, empty string for others
      if (formatType == 'Currency' || formatType == 'Number' || formatType == 'Percent') {
        return '0';
      }
      return '';
    }
    
    // Normalize formatType
    String normalizedFormatType = formatType != null ? formatType.trim() : null;
    
    if (normalizedFormatType == 'Currency') {
      if (value instanceof Decimal || value instanceof Integer || value instanceof Double) {
        Decimal decimalValue = value instanceof Decimal 
          ? (Decimal) value 
          : Decimal.valueOf(String.valueOf(value));
        return '$' + decimalValue.setScale(2).toPlainString();
      }
      return String.valueOf(value);
    } else if (normalizedFormatType == 'Percent') {
      if (value instanceof Decimal || value instanceof Integer || value instanceof Double) {
        Decimal decimalValue = value instanceof Decimal 
          ? (Decimal) value 
          : Decimal.valueOf(String.valueOf(value));
        // Percent values are typically stored as decimals (0.125 = 12.5%)
        // If value is already a percentage (e.g., 12.5), use as-is
        // Otherwise multiply by 100
        if (decimalValue.abs() <= 1) {
          decimalValue = decimalValue * 100;
        }
        return decimalValue.setScale(1).toPlainString() + '%';
      }
      return String.valueOf(value) + '%';
    } else if (normalizedFormatType == 'Number') {
      if (value instanceof Decimal || value instanceof Integer || value instanceof Double) {
        Decimal decimalValue = value instanceof Decimal 
          ? (Decimal) value 
          : Decimal.valueOf(String.valueOf(value));
        // Format with thousand separators
        return decimalValue.setScale(0).toPlainString();
      }
      return String.valueOf(value);
    } else if (normalizedFormatType == 'Date') {
      if (value instanceof Date) {
        Date dateValue = (Date) value;
        return dateValue.format();
      } else if (value instanceof Datetime) {
        Datetime dtValue = (Datetime) value;
        return dtValue.date().format();
      }
      return String.valueOf(value);
    } else if (normalizedFormatType == 'DateTime') {
      if (value instanceof Datetime) {
        Datetime dtValue = (Datetime) value;
        return dtValue.format();
      }
      return String.valueOf(value);
    }
    
    // Default: return string representation
    return String.valueOf(value);
  }

}