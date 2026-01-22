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
        SELECT Id, Name, HM_Active__c, HM_Dashboard_Component__c, HM_SOQL_Query__c,
               HM_Order__c, HM_Row_Icon_Name__c, HM_Return_Type__c, HM_Query_Config__c,
               HM_Dashboard_Component__r.HM_Type__c
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
      info.order = dataSource.HM_Order__c != null ? Integer.valueOf(dataSource.HM_Order__c) : 1;
      info.rowIconName = dataSource.HM_Row_Icon_Name__c;
      info.componentType = dataSource.HM_Dashboard_Component__r?.HM_Type__c;
      info.returnType = dataSource.HM_Return_Type__c;
      info.queryConfig = dataSource.HM_Query_Config__c;
      
      return info;
      
    } catch (QueryException ex) {
      throw new AuraHandledException('Record not found: ' + ex.getMessage());
    } catch (Exception ex) {
      throw new AuraHandledException('Error loading data source: ' + ex.getMessage());
    }
  }
  
  /**
   * @description Save or update complete Data Source record (all pages)
   * @param recordId Existing record ID (null for new record)
   * @param name Data Source Name
   * @param active Active checkbox value
   * @param dashboardComponentId Dashboard Component lookup ID
   * @param orderValue Display order value
   * @param rowIconName Row icon name (only for List type components)
   * @param returnType Return type (List or Aggregate)
   * @param soqlQuery Generated SOQL query string
   * @param queryConfig JSON configuration for wizard state reconstruction
   * @return Id Saved record ID
   */
  @AuraEnabled
  public static Id saveDataSourceComplete(
    Id recordId,
    String name,
    Boolean active,
    Id dashboardComponentId,
    Integer orderValue,
    String rowIconName,
    String returnType,
    String soqlQuery,
    String queryConfig
  ) {
    // Validate required fields
    List<String> validationErrors = new List<String>();
    if (String.isBlank(name)) {
      validationErrors.add('Data Source Name is required');
    }
    if (dashboardComponentId == null) {
      validationErrors.add('Dashboard Component is required');
    }
    if (orderValue == null) {
      validationErrors.add('Order is required');
    }
    if (String.isBlank(returnType)) {
      validationErrors.add('Return Type is required');
    }
    if (String.isBlank(soqlQuery)) {
      validationErrors.add('SOQL Query is required');
    }
    
    if (!validationErrors.isEmpty()) {
      throw new AuraHandledException(String.join(validationErrors, '; '));
    }
    
    try {
      // Check object-level CRUD permissions
      if (recordId == null && !Schema.sObjectType.HM_Dashboard_Data_Source__c.isCreateable()) {
        throw new AuraHandledException('Insufficient permissions to create Data Source records');
      }
      if (recordId != null && !Schema.sObjectType.HM_Dashboard_Data_Source__c.isUpdateable()) {
        throw new AuraHandledException('Insufficient permissions to update Data Source records');
      }
      
      // Check field-level security for all fields we're writing
      Map<String, Schema.SObjectField> fieldMap = Schema.sObjectType.HM_Dashboard_Data_Source__c.fields.getMap();
      
      List<String> fieldsToCheck = new List<String>{
        'Name', 'HM_Active__c', 'HM_Dashboard_Component__c', 'HM_Order__c',
        'HM_Row_Icon_Name__c', 'HM_Return_Type__c', 'HM_SOQL_Query__c',
        'HM_Query_Config__c'
      };
      
      for (String fieldName : fieldsToCheck) {
        Schema.SObjectField field = fieldMap.get(fieldName);
        if (field != null) {
          Schema.DescribeFieldResult fieldDesc = field.getDescribe();
          Boolean canWrite = recordId == null ? fieldDesc.isCreateable() : fieldDesc.isUpdateable();
          if (!canWrite) {
            throw new AuraHandledException('Insufficient permissions to modify ' + fieldDesc.getLabel() + ' field');
          }
        }
      }
      
      HM_Dashboard_Data_Source__c dataSource;
      
      if (recordId != null) {
        // Update existing record - check read access first
        if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
          throw new AuraHandledException('Insufficient permissions to read Data Source records');
        }
        
        List<HM_Dashboard_Data_Source__c> existing = [
          SELECT Id
          FROM HM_Dashboard_Data_Source__c
          WHERE Id = :recordId
          LIMIT 1
        ];
        
        if (existing.isEmpty()) {
          throw new AuraHandledException('Record not found');
        }
        
        dataSource = existing[0];
        dataSource.Name = name;
        dataSource.HM_Active__c = active != null ? active : true;
        dataSource.HM_Dashboard_Component__c = dashboardComponentId;
        dataSource.HM_Order__c = orderValue;
        dataSource.HM_Row_Icon_Name__c = rowIconName;
        dataSource.HM_Return_Type__c = returnType;
        dataSource.HM_SOQL_Query__c = soqlQuery;
        dataSource.HM_Query_Config__c = queryConfig;
        
        update dataSource;
      } else {
        // Create new record
        dataSource = new HM_Dashboard_Data_Source__c(
          Name = name,
          HM_Active__c = active != null ? active : true,
          HM_Dashboard_Component__c = dashboardComponentId,
          HM_Order__c = orderValue,
          HM_Row_Icon_Name__c = rowIconName,
          HM_Return_Type__c = returnType,
          HM_SOQL_Query__c = soqlQuery,
          HM_Query_Config__c = queryConfig
        );
        
        insert dataSource;
      }
      
      return dataSource.Id;
      
    } catch (DmlException ex) {
      throw new AuraHandledException('Error saving data source: ' + ex.getDmlMessage(0));
    } catch (AuraHandledException ex) {
      throw ex;
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
   * Used by loadDataSource for all pages
   */
  public class DataSourceInfo {
    @AuraEnabled public Id recordId;
    @AuraEnabled public String name;
    @AuraEnabled public Boolean active;
    @AuraEnabled public Id dashboardComponentId;
    @AuraEnabled public String soqlQuery;
    @AuraEnabled public Integer order;
    @AuraEnabled public String rowIconName;
    @AuraEnabled public String componentType;
    @AuraEnabled public String returnType;
    @AuraEnabled public String queryConfig;
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
}
