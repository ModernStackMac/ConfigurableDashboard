/**
 * @description Service class for Dashboard Data Source Builder component
 * Provides metadata and validation services for SOQL query building
 * 
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_DataSourceBuilderService {
  
  // ==================== PUBLIC METHODS ====================
  
  /**
   * @description Load existing Data Source record
   * @param recordId Record ID to load
   * @return DataSourceInfo Record data
   */
  @AuraEnabled
  public static DataSourceInfo loadDataSource(Id recordId) {
    if (recordId == null) {
      throw new AuraHandledException('Record ID is required');
    }
    
    try {
      // Check object-level read permissions
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
        throw new AuraHandledException('Insufficient permissions to read Data Source records');
      }
      
      List<HM_Dashboard_Data_Source__c> dataSources = [
        SELECT Id, Name, HM_Active__c, HM_Dashboard_Component__c, HM_SOQL_Query__c, HM_Type__c,
               HM_Order__c, HM_Row_Icon_Name__c, HM_Dashboard_Component__r.HM_Type__c
        FROM HM_Dashboard_Data_Source__c
        WHERE Id = :recordId
        LIMIT 1
      ];
      
      if (dataSources.isEmpty()) {
        throw new AuraHandledException('Record not found');
      }
      
      // Strip inaccessible fields for FLS enforcement
      HM_Dashboard_Data_Source__c dataSource = (HM_Dashboard_Data_Source__c) Security.stripInaccessible(
        AccessType.READABLE,
        dataSources
      ).getRecords()[0];
      
      DataSourceInfo info = new DataSourceInfo();
      info.recordId = dataSource.Id;
      info.name = dataSource.Name;
      info.active = dataSource.HM_Active__c != null ? dataSource.HM_Active__c : true;
      info.dashboardComponentId = dataSource.HM_Dashboard_Component__c;
      info.soqlQuery = dataSource.HM_SOQL_Query__c;
      info.type = dataSource.HM_Type__c;
      info.order = dataSource.HM_Order__c != null ? Integer.valueOf(dataSource.HM_Order__c) : 1;
      info.rowIconName = dataSource.HM_Row_Icon_Name__c;
      info.componentType = dataSource.HM_Dashboard_Component__r?.HM_Type__c;
      
      return info;
      
    } catch (QueryException ex) {
      throw new AuraHandledException('Record not found: ' + ex.getMessage());
    } catch (Exception ex) {
      throw new AuraHandledException('Error loading data source: ' + ex.getMessage());
    }
  }
  
  /**
   * @description Save or update Data Source basic information (Page 1 only)
   * @param recordId Existing record ID (null for new record)
   * @param name Data Source Name
   * @param active Active checkbox value
   * @param dashboardComponentId Dashboard Component lookup ID
   * @param orderValue Display order value
   * @param rowIconName Row icon name (only for List type components)
   * @return Id Saved record ID
   */
  @AuraEnabled
  public static Id saveDataSourceBasicInfo(
    Id recordId,
    String name,
    Boolean active,
    Id dashboardComponentId,
    Integer orderValue,
    String rowIconName
  ) {
    // Validate required fields
    if (String.isBlank(name)) {
      throw new AuraHandledException('Data Source Name is required');
    }
    if (dashboardComponentId == null) {
      throw new AuraHandledException('Dashboard Component is required');
    }
    
    try {
      // Check object-level CRUD permissions
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isCreateable() && recordId == null) {
        throw new AuraHandledException('Insufficient permissions to create Data Source records');
      }
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isUpdateable() && recordId != null) {
        throw new AuraHandledException('Insufficient permissions to update Data Source records');
      }
      
      // Check field-level security
      Map<String, Schema.SObjectField> fieldMap = Schema.sObjectType.HM_Dashboard_Data_Source__c.fields.getMap();
      if (!fieldMap.get('Name').getDescribe().isCreateable() && !fieldMap.get('Name').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Name field');
      }
      if (!fieldMap.get('HM_Active__c').getDescribe().isCreateable() && !fieldMap.get('HM_Active__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Active field');
      }
      if (!fieldMap.get('HM_Dashboard_Component__c').getDescribe().isCreateable() && !fieldMap.get('HM_Dashboard_Component__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Dashboard Component field');
      }
      if (!fieldMap.get('HM_Order__c').getDescribe().isCreateable() && !fieldMap.get('HM_Order__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Order field');
      }
      if (!fieldMap.get('HM_Row_Icon_Name__c').getDescribe().isCreateable() && !fieldMap.get('HM_Row_Icon_Name__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Row Icon Name field');
      }
      
      HM_Dashboard_Data_Source__c dataSource;
      
      if (recordId != null) {
        // Update existing record - check read access
        if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
          throw new AuraHandledException('Insufficient permissions to read Data Source records');
        }
        
        dataSource = [
          SELECT Id, Name, HM_Active__c, HM_Dashboard_Component__c, HM_Order__c, HM_Row_Icon_Name__c
          FROM HM_Dashboard_Data_Source__c
          WHERE Id = :recordId
          LIMIT 1
        ];
        dataSource.Name = name;
        dataSource.HM_Active__c = active != null ? active : true;
        dataSource.HM_Dashboard_Component__c = dashboardComponentId;
        dataSource.HM_Order__c = orderValue != null ? orderValue : 1;
        dataSource.HM_Row_Icon_Name__c = rowIconName;
        update dataSource;
      } else {
        // Create new record
        dataSource = new HM_Dashboard_Data_Source__c(
          Name = name,
          HM_Active__c = active != null ? active : true,
          HM_Dashboard_Component__c = dashboardComponentId,
          HM_Order__c = orderValue != null ? orderValue : 1,
          HM_Row_Icon_Name__c = rowIconName
        );
        insert dataSource;
      }
      
      return dataSource.Id;
      
    } catch (DmlException ex) {
      throw new AuraHandledException('Error saving data source: ' + ex.getDmlMessage(0));
    } catch (Exception ex) {
      throw new AuraHandledException('Error saving data source: ' + ex.getMessage());
    }
  }
  
  /**
   * @description Get all accessible and queryable objects in the org
   * @return List<ObjectInfo> List of objects sorted by label
   */
  @AuraEnabled(cacheable=true)
  public static List<ObjectInfo> getAccessibleObjects() {
    List<ObjectInfo> objects = new List<ObjectInfo>();
    
    try {
      Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
      
      for (String objectName : globalDescribe.keySet()) {
        Schema.DescribeSObjectResult describe = globalDescribe.get(objectName).getDescribe();
        
        // Only include queryable objects the user can access
        if (describe.isQueryable() && describe.isAccessible()) {
          ObjectInfo obj = new ObjectInfo();
          obj.apiName = describe.getName();
          obj.label = describe.getLabel();
          obj.isCustom = describe.isCustom();
          objects.add(obj);
        }
      }
      
      // Sort by label
      objects.sort();
      
    } catch (Exception ex) {
      throw new AuraHandledException('Error retrieving objects: ' + ex.getMessage());
    }
    
    return objects;
  }
  
  /**
   * @description Get accessible fields for a given object
   * @param objectApiName API name of the object
   * @return List<FieldInfo> List of accessible fields sorted by label
   */
  @AuraEnabled(cacheable=true)
  public static List<FieldInfo> getObjectFields(String objectApiName) {
    if (String.isBlank(objectApiName)) {
      return new List<FieldInfo>();
    }
    
    List<FieldInfo> fields = new List<FieldInfo>();
    Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
    
    if (objType == null || !objType.getDescribe().isAccessible()) {
      throw new AuraHandledException('Object not accessible: ' + objectApiName);
    }
    
    Map<String, Schema.SObjectField> fieldMap = objType.getDescribe().fields.getMap();
    
    for (String fieldName : fieldMap.keySet()) {
      Schema.DescribeFieldResult fieldDesc = fieldMap.get(fieldName).getDescribe();
      if (fieldDesc.isAccessible()) {
        FieldInfo fi = new FieldInfo();
        fi.apiName = fieldDesc.getName();
        fi.label = fieldDesc.getLabel();
        fi.type = String.valueOf(fieldDesc.getType());
        fi.isRequired = !fieldDesc.isNillable() && fieldDesc.isCreateable();
        fi.isFilterable = fieldDesc.isFilterable();
        
        // Populate picklist values for picklist fields
        Schema.DisplayType fieldType = fieldDesc.getType();
        if (fieldType == Schema.DisplayType.PICKLIST || fieldType == Schema.DisplayType.MULTIPICKLIST) {
          fi.picklistValues = new List<PicklistValue>();
          for (Schema.PicklistEntry pe : fieldDesc.getPicklistValues()) {
            if (pe.isActive()) {
              PicklistValue pv = new PicklistValue();
              pv.label = pe.getLabel();
              pv.value = pe.getValue();
              fi.picklistValues.add(pv);
            }
          }
        }
        
        fields.add(fi);
      }
    }
    
    fields.sort();
    return fields;
  }
  
  /**
   * @description Execute a preview query and return limited results
   * @param objectApiName API name of the object to query
   * @param fieldApiNames List of field API names to select
   * @param whereClause WHERE clause conditions (without 'WHERE' keyword)
   * @param queryLimit User-specified limit (used for count, preview always limited to 5)
   * @return QueryResult Query results with columns, rows, and total count
   */
  @AuraEnabled(cacheable=false)
  public static QueryResult executePreviewQuery(
    String objectApiName,
    List<String> fieldApiNames,
    String whereClause,
    Integer queryLimit
  ) {
    QueryResult result = new QueryResult();
    result.columns = new List<ColumnInfo>();
    result.rows = new List<Map<String, Object>>();
    result.totalCount = 0;
    
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('Object API name is required');
    }
    if (fieldApiNames == null || fieldApiNames.isEmpty()) {
      throw new AuraHandledException('At least one field is required');
    }
    
    try {
      // Validate object access
      Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
      if (objType == null || !objType.getDescribe().isAccessible() || !objType.getDescribe().isQueryable()) {
        throw new AuraHandledException('Object not accessible: ' + objectApiName);
      }
      
      // Build field list - ensure Id is always first
      Set<String> fieldSet = new Set<String>();
      List<String> orderedFields = new List<String>();
      
      // Add Id first if not already in list
      if (!fieldApiNames.contains('Id')) {
        orderedFields.add('Id');
        fieldSet.add('Id');
      }
      
      // Add remaining fields
      Map<String, Schema.SObjectField> fieldMap = objType.getDescribe().fields.getMap();
      for (String fieldName : fieldApiNames) {
        String lowerFieldName = fieldName.toLowerCase();
        if (fieldMap.containsKey(lowerFieldName) && !fieldSet.contains(fieldName)) {
          Schema.DescribeFieldResult fieldDesc = fieldMap.get(lowerFieldName).getDescribe();
          if (fieldDesc.isAccessible()) {
            orderedFields.add(fieldName);
            fieldSet.add(fieldName);
          }
        }
      }
      
      if (orderedFields.isEmpty()) {
        throw new AuraHandledException('No accessible fields found');
      }
      
      // Build column info
      for (String fieldName : orderedFields) {
        Schema.DescribeFieldResult fieldDesc = fieldMap.get(fieldName.toLowerCase()).getDescribe();
        ColumnInfo col = new ColumnInfo();
        col.apiName = fieldDesc.getName();
        col.label = fieldDesc.getLabel();
        col.type = String.valueOf(fieldDesc.getType());
        result.columns.add(col);
      }
      
      // Build SOQL query
      String fieldList = String.join(orderedFields, ', ');
      String soql = 'SELECT ' + fieldList + ' FROM ' + String.escapeSingleQuotes(objectApiName);
      
      // Add WHERE clause if provided
      if (String.isNotBlank(whereClause)) {
        // Replace merge fields
        String processedWhere = whereClause;
        if (processedWhere.contains(':UserInfo.getUserId()')) {
          processedWhere = processedWhere.replace(':UserInfo.getUserId()', '\'' + String.escapeSingleQuotes(UserInfo.getUserId()) + '\'');
        }
        soql += ' WHERE ' + processedWhere;
      }
      
      // Get total count (respecting user's limit if set)
      String countSoql = 'SELECT COUNT() FROM ' + String.escapeSingleQuotes(objectApiName);
      if (String.isNotBlank(whereClause)) {
        String processedWhere = whereClause;
        if (processedWhere.contains(':UserInfo.getUserId()')) {
          processedWhere = processedWhere.replace(':UserInfo.getUserId()', '\'' + String.escapeSingleQuotes(UserInfo.getUserId()) + '\'');
        }
        countSoql += ' WHERE ' + processedWhere;
      }
      
      Integer totalCount = Database.countQuery(countSoql);
      
      // Apply user limit to total count if specified
      if (queryLimit != null && queryLimit > 0 && totalCount > queryLimit) {
        result.totalCount = queryLimit;
      } else {
        result.totalCount = totalCount;
      }
      
      // Always limit preview to 5 rows
      soql += ' LIMIT 5';
      
      // Execute query
      List<SObject> records = Database.query(soql);
      
      // Apply FLS stripping
      SObjectAccessDecision decision = Security.stripInaccessible(AccessType.READABLE, records);
      List<SObject> strippedRecords = decision.getRecords();
      
      // Convert to maps
      for (SObject record : strippedRecords) {
        Map<String, Object> recordMap = new Map<String, Object>();
        for (String fieldName : orderedFields) {
          try {
            Object value = record.get(fieldName);
            // Format the value for display
            if (value instanceof Date) {
              recordMap.put(fieldName, ((Date)value).format());
            } else if (value instanceof Datetime) {
              recordMap.put(fieldName, ((Datetime)value).format());
            } else if (value instanceof Decimal) {
              recordMap.put(fieldName, value);
            } else if (value != null) {
              recordMap.put(fieldName, String.valueOf(value));
            } else {
              recordMap.put(fieldName, null);
            }
          } catch (Exception e) {
            recordMap.put(fieldName, null);
          }
        }
        result.rows.add(recordMap);
      }
      
    } catch (QueryException ex) {
      throw new AuraHandledException('Query error: ' + ex.getMessage());
    } catch (Exception ex) {
      throw new AuraHandledException('Error executing preview: ' + ex.getMessage());
    }
    
    return result;
  }
  
  // ==================== INNER CLASSES ====================
  
  /**
   * @description Data Source information wrapper
   * Used by loadDataSource for Page 1
   */
  public class DataSourceInfo {
    @AuraEnabled public Id recordId;
    @AuraEnabled public String name;
    @AuraEnabled public Boolean active;
    @AuraEnabled public Id dashboardComponentId;
    @AuraEnabled public String soqlQuery;
    @AuraEnabled public String type;
    @AuraEnabled public Integer order;
    @AuraEnabled public String rowIconName;
    @AuraEnabled public String componentType;
  }
  
  /**
   * @description Object information wrapper for object selector
   * Implements Comparable for sorting by label
   */
  public class ObjectInfo implements Comparable {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public Boolean isCustom;
    
    public Integer compareTo(Object other) {
      ObjectInfo otherObj = (ObjectInfo) other;
      if (this.label == null && otherObj.label == null) {
        return 0;
      }
      if (this.label == null) {
        return 1;
      }
      if (otherObj.label == null) {
        return -1;
      }
      return this.label.compareTo(otherObj.label);
    }
  }
  
  /**
   * @description Field information wrapper for field selector
   * Implements Comparable for sorting by label
   */
  public class FieldInfo implements Comparable {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type;
    @AuraEnabled public Boolean isRequired;
    @AuraEnabled public Boolean isFilterable;
    @AuraEnabled public List<PicklistValue> picklistValues;
    
    public Integer compareTo(Object other) {
      FieldInfo otherField = (FieldInfo) other;
      if (this.label == null && otherField.label == null) {
        return 0;
      }
      if (this.label == null) {
        return 1;
      }
      if (otherField.label == null) {
        return -1;
      }
      return this.label.compareTo(otherField.label);
    }
  }
  
  /**
   * @description Picklist value wrapper for picklist fields
   */
  public class PicklistValue {
    @AuraEnabled public String label;
    @AuraEnabled public String value;
  }
  
  /**
   * @description Query result wrapper for preview execution
   */
  public class QueryResult {
    @AuraEnabled public List<ColumnInfo> columns;
    @AuraEnabled public List<Map<String, Object>> rows;
    @AuraEnabled public Integer totalCount;
  }
  
  /**
   * @description Column information wrapper for datatable
   */
  public class ColumnInfo {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type;
  }
  
  // ============================================================================
  // PAGE 2/3 CODE - COMMENTED OUT FOR PAGE 1 FOCUS
  // ============================================================================
  
  /*
  // ==================== CONSTANTS ====================
  
  private static final String QUERY_TYPE_SOQL = 'SOQL';
  private static final Integer MAX_PREVIEW_RECORDS = 10;
  
  private static final Set<String> ALLOWED_MERGE_FIELDS = new Set<String>{
    '{!UserId}',
    '{!Today}',
    '{!ThisMonth}'
  };
  
  private static final Pattern DATE_LITERAL_PATTERN = Pattern.compile('(?i)^(TODAY|YESTERDAY|LAST_N_DAYS:\\d+|THIS_WEEK|LAST_WEEK|THIS_MONTH|LAST_MONTH|THIS_QUARTER|LAST_QUARTER|THIS_YEAR|LAST_YEAR)$');
  
  // ==================== PUBLIC METHODS ====================
  
  @AuraEnabled(cacheable=true)
  public static List<ObjectInfo> getAvailableObjects() {
    List<ObjectInfo> objects = new List<ObjectInfo>();
    
    try {
      Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
      
      for (String objectName : globalDescribe.keySet()) {
        Schema.SObjectType objType = globalDescribe.get(objectName);
        Schema.DescribeSObjectResult describe = objType.getDescribe();
        
        // Only include queryable objects that the user can access
        if (describe.isQueryable() && describe.isAccessible()) {
          ObjectInfo objInfo = new ObjectInfo();
          objInfo.apiName = describe.getName();
          objInfo.label = describe.getLabel();
          objInfo.keyPrefix = describe.getKeyPrefix();
          objInfo.isCustom = describe.isCustom();
          
          objects.add(objInfo);
        }
      }
      
      // Sort by label for better UX
      objects.sort(new ObjectInfoComparator());
      
    } catch (Exception ex) {
      throw new AuraHandledException('Error retrieving objects: ' + ex.getMessage());
    }
    
    return objects;
  }
  
  @AuraEnabled(cacheable=true)
  public static List<FieldInfo> getObjectFields(String objectApiName) {
    // Return empty list if objectApiName is blank (wire service may call with null/empty)
    if (String.isBlank(objectApiName)) {
      return new List<FieldInfo>();
    }
    
    List<FieldInfo> fields = new List<FieldInfo>();
    
    try {
      Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
      
      if (objType == null) {
        throw new AuraHandledException('Object not found: ' + objectApiName);
      }
      
      Schema.DescribeSObjectResult describe = objType.getDescribe();
      
      if (!describe.isAccessible()) {
        throw new AuraHandledException('Insufficient permissions to access object: ' + objectApiName);
      }
      
      Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();
      
      for (String fieldName : fieldMap.keySet()) {
        Schema.SObjectField field = fieldMap.get(fieldName);
        Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
        
        // Only include accessible fields
        if (fieldDescribe.isAccessible()) {
          FieldInfo fieldInfo = new FieldInfo();
          fieldInfo.apiName = fieldDescribe.getName();
          fieldInfo.label = fieldDescribe.getLabel();
          fieldInfo.type = getFieldTypeString(fieldDescribe.getType());
          fieldInfo.isAccessible = fieldDescribe.isAccessible();
          fieldInfo.isCreateable = fieldDescribe.isCreateable();
          fieldInfo.isUpdateable = fieldDescribe.isUpdateable();
          
          // Check if it's a lookup/relationship field
          if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE) {
            fieldInfo.isLookup = true;
            List<Schema.sObjectType> referenceTo = fieldDescribe.getReferenceTo();
            if (referenceTo != null && !referenceTo.isEmpty()) {
              fieldInfo.relatedObject = referenceTo[0].getDescribe().getName();
            }
          } else {
            fieldInfo.isLookup = false;
            fieldInfo.relatedObject = null;
          }
          
          fields.add(fieldInfo);
        }
      }
      
      // Sort by label for better UX
      fields.sort(new FieldInfoComparator());
      
    } catch (Exception ex) {
      throw new AuraHandledException('Error retrieving fields: ' + ex.getMessage());
    }
    
    return fields;
  }
  
  @AuraEnabled(cacheable=true)
  public static FieldMetadata getFieldMetadata(String objectApiName, String fieldApiName) {
    if (String.isBlank(objectApiName) || String.isBlank(fieldApiName)) {
      throw new AuraHandledException('Object API name and Field API name are required');
    }
    
    try {
      Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
      
      if (objType == null) {
        throw new AuraHandledException('Object not found: ' + objectApiName);
      }
      
      Schema.DescribeSObjectResult describe = objType.getDescribe();
      Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();
      Schema.SObjectField field = fieldMap.get(fieldApiName);
      
      if (field == null) {
        throw new AuraHandledException('Field not found: ' + fieldApiName);
      }
      
      Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
      
      FieldMetadata metadata = new FieldMetadata();
      metadata.apiName = fieldDescribe.getName();
      metadata.label = fieldDescribe.getLabel();
      metadata.type = getFieldTypeString(fieldDescribe.getType());
      
      // Check if it's a lookup/relationship field
      if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE) {
        metadata.isLookup = true;
        List<Schema.sObjectType> referenceTo = fieldDescribe.getReferenceTo();
        if (referenceTo != null && !referenceTo.isEmpty()) {
          metadata.referenceTo = referenceTo[0].getDescribe().getName();
        }
      } else {
        metadata.isLookup = false;
        metadata.referenceTo = null;
      }
      
      return metadata;
      
    } catch (Exception ex) {
      throw new AuraHandledException('Error retrieving field metadata: ' + ex.getMessage());
    }
  }
  
  @AuraEnabled
  public static ValidationResult validateSOQLQuery(String soqlQuery) {
    ValidationResult result = new ValidationResult();
    result.isValid = true;
    result.warnings = new List<String>();
    
    if (String.isBlank(soqlQuery)) {
      result.isValid = false;
      result.errorMessage = 'SOQL query cannot be empty';
      return result;
    }
    
    try {
      // Basic validation: check if it starts with SELECT
      String trimmedQuery = soqlQuery.trim();
      if (!trimmedQuery.toUpperCase().startsWith('SELECT')) {
        result.isValid = false;
        result.errorMessage = 'SOQL query must start with SELECT';
        return result;
      }
      
      // Check for DML operations (not allowed)
      String upperQuery = trimmedQuery.toUpperCase();
      if (upperQuery.contains('INSERT') || 
          upperQuery.contains('UPDATE') || 
          upperQuery.contains('DELETE') || 
          upperQuery.contains('UPSERT')) {
        result.isValid = false;
        result.errorMessage = 'DML operations are not allowed in SOQL queries';
        return result;
      }
      
      // Try to compile the query (this will catch syntax errors)
      // Note: We can't actually execute it, but we can check basic structure
      if (!trimmedQuery.toUpperCase().contains('FROM')) {
        result.isValid = false;
        result.errorMessage = 'SOQL query must include a FROM clause';
        return result;
      }
      
      // Additional warnings
      if (trimmedQuery.length() > 100000) {
        result.warnings.add('Query is very long. Consider breaking it into smaller queries.');
      }
      
    } catch (Exception ex) {
      result.isValid = false;
      result.errorMessage = 'Validation error: ' + ex.getMessage();
    }
    
    return result;
  }
  
  @AuraEnabled
  public static QueryPreviewResult executeQueryForPreview(String soqlQuery, List<String> selectedFields) {
    QueryPreviewResult result = new QueryPreviewResult();
    result.success = false;
    result.rows = new List<Map<String, Object>>();
    result.columns = new List<ColumnInfo>();
    result.recordCount = 0;
    
    if (String.isBlank(soqlQuery)) {
      result.errorMessage = 'SOQL query cannot be empty';
      return result;
    }
    
    try {
      // Comprehensive SOQL injection prevention
      String upperQuery = soqlQuery.toUpperCase().trim();
      
      // Block DML operations
      if (upperQuery.contains('INSERT') || 
          upperQuery.contains('UPDATE') || 
          upperQuery.contains('DELETE') || 
          upperQuery.contains('UPSERT') ||
          upperQuery.contains('MERGE') ||
          upperQuery.contains('UNDELETE')) {
        result.errorMessage = 'DML operations are not allowed';
        return result;
      }
      
      // Block other dangerous operations
      if (upperQuery.contains('EXECUTE') || 
          upperQuery.contains('CALL') ||
          upperQuery.contains('EXEC')) {
        result.errorMessage = 'Stored procedure calls are not allowed';
        return result;
      }
      
      // Ensure query starts with SELECT
      if (!upperQuery.startsWith('SELECT')) {
        result.errorMessage = 'Query must start with SELECT';
        return result;
      }
      
      // Block semicolons (prevents query chaining)
      if (soqlQuery.contains(';')) {
        result.errorMessage = 'Semicolons are not allowed in queries';
        return result;
      }
      
      // Ensure query has LIMIT (max 10 for preview)
      String processedQuery = soqlQuery.trim();
      String limitClause = ' LIMIT ' + String.valueOf(MAX_PREVIEW_RECORDS);
      if (!processedQuery.toUpperCase().contains('LIMIT')) {
        // Add LIMIT if not present
        processedQuery += limitClause;
      } else {
        // Replace existing LIMIT with max preview records
        processedQuery = processedQuery.replaceAll('(?i)LIMIT\\s+\\d+', limitClause);
      }
      
      // Replace merge fields with actual values for preview
      processedQuery = replaceMergeFieldsForPreview(processedQuery);
      
      // Execute query
      List<SObject> records = Database.query(processedQuery);
      result.recordCount = records.size();
      
      if (records.isEmpty()) {
        result.success = true;
        return result;
      }
      
      // Determine which fields to include
      Set<String> fieldsToInclude = new Set<String>();
      if (selectedFields != null && !selectedFields.isEmpty()) {
        // Use provided selected fields
        fieldsToInclude.addAll(selectedFields);
        // Always include Id if not already in the list
        if (!fieldsToInclude.contains('Id')) {
          fieldsToInclude.add('Id');
        }
      } else {
        // If no fields specified, get all fields from first record
        Map<String, Object> firstRecord = records[0].getPopulatedFieldsAsMap();
        fieldsToInclude.addAll(firstRecord.keySet());
      }
      
      // Build column definitions only for selected fields
      Map<String, Object> firstRecord = records[0].getPopulatedFieldsAsMap();
      for (String fieldName : fieldsToInclude) {
        // Only include fields that exist in the record
        if (firstRecord.containsKey(fieldName)) {
          ColumnInfo col = new ColumnInfo();
          col.label = fieldName;
          col.fieldName = fieldName;
          col.type = getFieldTypeForColumn(firstRecord.get(fieldName));
          result.columns.add(col);
        }
      }
      
      // Convert records to maps, filtering to only selected fields
      for (SObject record : records) {
        Map<String, Object> recordMap = record.getPopulatedFieldsAsMap();
        Map<String, Object> filteredRecord = new Map<String, Object>();
        
        for (String fieldName : fieldsToInclude) {
          if (recordMap.containsKey(fieldName)) {
            filteredRecord.put(fieldName, recordMap.get(fieldName));
          }
        }
        
        result.rows.add(filteredRecord);
      }
      
      result.success = true;
      
    } catch (QueryException ex) {
      result.errorMessage = 'Query Error: ' + ex.getMessage();
    } catch (Exception ex) {
      result.errorMessage = 'Error executing query: ' + ex.getMessage();
    }
    
    return result;
  }
  
  @AuraEnabled
  public static Id saveDataSource(Id recordId, String name, Boolean active, Id dashboardComponentId, String soqlQuery) {
    // Validate required fields
    if (String.isBlank(name)) {
      throw new AuraHandledException('Data Source Name is required');
    }
    if (dashboardComponentId == null) {
      throw new AuraHandledException('Dashboard Component is required');
    }
    if (String.isBlank(soqlQuery)) {
      throw new AuraHandledException('SOQL Query is required');
    }
    
    try {
      // Check object-level CRUD permissions
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isCreateable() && recordId == null) {
        throw new AuraHandledException('Insufficient permissions to create Data Source records');
      }
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isUpdateable() && recordId != null) {
        throw new AuraHandledException('Insufficient permissions to update Data Source records');
      }
      
      // Check field-level security
      Map<String, Schema.SObjectField> fieldMap = Schema.sObjectType.HM_Dashboard_Data_Source__c.fields.getMap();
      if (!fieldMap.get('Name').getDescribe().isCreateable() && !fieldMap.get('Name').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Name field');
      }
      if (!fieldMap.get('HM_Active__c').getDescribe().isCreateable() && !fieldMap.get('HM_Active__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Active field');
      }
      if (!fieldMap.get('HM_Dashboard_Component__c').getDescribe().isCreateable() && !fieldMap.get('HM_Dashboard_Component__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify Dashboard Component field');
      }
      if (!fieldMap.get('HM_SOQL_Query__c').getDescribe().isCreateable() && !fieldMap.get('HM_SOQL_Query__c').getDescribe().isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to modify SOQL Query field');
      }
      
      HM_Dashboard_Data_Source__c dataSource;
      
      if (recordId != null) {
        // Update existing record - check read access
        if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
          throw new AuraHandledException('Insufficient permissions to read Data Source records');
        }
        
        dataSource = [
          SELECT Id, Name, HM_Active__c, HM_Dashboard_Component__c, HM_SOQL_Query__c, HM_Type__c
          FROM HM_Dashboard_Data_Source__c
          WHERE Id = :recordId
          LIMIT 1
        ];
        dataSource.Name = name;
        dataSource.HM_Active__c = active != null ? active : true;
        dataSource.HM_Dashboard_Component__c = dashboardComponentId;
        dataSource.HM_SOQL_Query__c = soqlQuery;
        dataSource.HM_Type__c = HM_DataSourceBuilderService.QUERY_TYPE_SOQL;
        update dataSource;
      } else {
        // Create new record
        dataSource = new HM_Dashboard_Data_Source__c(
          Name = name,
          HM_Active__c = active != null ? active : true,
          HM_Dashboard_Component__c = dashboardComponentId,
          HM_SOQL_Query__c = soqlQuery,
          HM_Type__c = QUERY_TYPE_SOQL
        );
        insert dataSource;
      }
      
      return dataSource.Id;
      
    } catch (DmlException ex) {
      throw new AuraHandledException('Error saving data source: ' + ex.getDmlMessage(0));
    } catch (Exception ex) {
      throw new AuraHandledException('Error saving data source: ' + ex.getMessage());
    }
  }
  
  // ==================== PRIVATE HELPER METHODS ====================
  
  private static String replaceMergeFieldsForPreview(String query) {
    if (String.isBlank(query)) {
      return query;
    }
    
    String result = query;
    
    // Only replace allowed merge fields
    if (result.contains('{!UserId}')) {
      String userId = '\'' + String.escapeSingleQuotes(UserInfo.getUserId()) + '\'';
      result = result.replace('{!UserId}', userId);
    }
    if (result.contains('{!Today}')) {
      String today = String.valueOf(Date.today());
      result = result.replace('{!Today}', today);
    }
    if (result.contains('{!ThisMonth}')) {
      String thisMonth = String.valueOf(Date.today().toStartOfMonth());
      result = result.replace('{!ThisMonth}', thisMonth);
    }
    
    // Remove any other merge field patterns that aren't in the allowed list
    result = result.replaceAll('\\{![^}]+\\}', '');
    
    return result;
  }
  
  private static String getFieldTypeForColumn(Object value) {
    if (value == null) {
      return 'text';
    }
    
    if (value instanceof Boolean) {
      return 'boolean';
    }
    if (value instanceof Integer || value instanceof Long || value instanceof Decimal || value instanceof Double) {
      return 'number';
    }
    if (value instanceof Date) {
      return 'date';
    }
    if (value instanceof Datetime) {
      return 'date';
    }
    if (value instanceof Id) {
      return 'id';
    }
    
    return 'text';
  }
  
  private static String getFieldTypeString(Schema.DisplayType displayType) {
    if (displayType == null) {
      return 'Unknown';
    }
    
    switch on displayType {
      when STRING, TEXTAREA, EMAIL, PHONE, URL, PICKLIST, MULTIPICKLIST {
        return 'String';
      }
      when INTEGER, DOUBLE, CURRENCY, PERCENT {
        return 'Number';
      }
      when DATE {
        return 'Date';
      }
      when DATETIME {
        return 'DateTime';
      }
      when TIME {
        return 'Time';
      }
      when BOOLEAN {
        return 'Boolean';
      }
      when ID, REFERENCE {
        return 'Id';
      }
      when BASE64 {
        return 'Blob';
      }
      when else {
        return 'Unknown';
      }
    }
  }
  
  // ==================== INNER CLASSES ====================
  
  public class ObjectInfo {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String keyPrefix;
    @AuraEnabled public Boolean isCustom;
  }
  
  public class FieldInfo {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type;
    @AuraEnabled public Boolean isLookup;
    @AuraEnabled public String relatedObject;
    @AuraEnabled public Boolean isAccessible;
    @AuraEnabled public Boolean isCreateable;
    @AuraEnabled public Boolean isUpdateable;
  }
  
  public class FieldMetadata {
    @AuraEnabled public String apiName;
    @AuraEnabled public String label;
    @AuraEnabled public String type;
    @AuraEnabled public String referenceTo;
    @AuraEnabled public Boolean isLookup;
  }
  
  public class ValidationResult {
    @AuraEnabled public Boolean isValid;
    @AuraEnabled public String errorMessage;
    @AuraEnabled public List<String> warnings;
  }
  
  public class QueryPreviewResult {
    @AuraEnabled public Boolean success;
    @AuraEnabled public List<Map<String, Object>> rows;
    @AuraEnabled public List<ColumnInfo> columns;
    @AuraEnabled public Integer recordCount;
    @AuraEnabled public String errorMessage;
  }
  
  public class ColumnInfo {
    @AuraEnabled public String label;
    @AuraEnabled public String fieldName;
    @AuraEnabled public String type;
  }
  
  // ==================== COMPARATOR CLASSES ====================
  
  private class ObjectInfoComparator implements Comparator<ObjectInfo> {
    public Integer compare(ObjectInfo obj1, ObjectInfo obj2) {
      if (obj1.label == null && obj2.label == null) return 0;
      if (obj1.label == null) return 1;
      if (obj2.label == null) return -1;
      return obj1.label.compareTo(obj2.label);
    }
  }
  
  private class FieldInfoComparator implements Comparator<FieldInfo> {
    public Integer compare(FieldInfo field1, FieldInfo field2) {
      if (field1.label == null && field2.label == null) return 0;
      if (field1.label == null) return 1;
      if (field2.label == null) return -1;
      return field1.label.compareTo(field2.label);
    }
  }
  */
}
