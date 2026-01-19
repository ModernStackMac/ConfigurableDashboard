/**
 * @description Service layer for dashboard configuration retrieval (metadata)
 * Retrieves dashboard, component group, and component configurations from custom objects
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_DashboardConfigService {
  // ==================== CONSTANTS ====================
  private static final Integer SALESFORCE_ID_LENGTH_15 = 15;
  private static final Integer SALESFORCE_ID_LENGTH_18 = 18;
  
  private static final Integer DEFAULT_RECORDS_PER_PAGE = 25;
  
  private static final String ACTION_TYPE_NAVIGATION = 'navigation';
  private static final String ACTION_NAME_NEW = 'new';
  
  private static final String OBJECT_API_OPPORTUNITY = 'Opportunity';
  private static final String OBJECT_API_CASE = 'Case';
  private static final String OBJECT_API_EVENT = 'Event';
  private static final String OBJECT_API_ACCOUNT = 'Account';
  
  private static final String ACTION_LABEL_LOG_OPPORTUNITY = 'Log New Opportunity';
  private static final String ACTION_LABEL_CREATE_CASE = 'Create Support Case';
  private static final String ACTION_LABEL_SCHEDULE_MEETING = 'Schedule Meeting';
  private static final String ACTION_LABEL_ADD_ACCOUNT = 'Add New Account';
  
  private static final String ACTION_ICON_MONEYBAG = 'utility:moneybag';
  private static final String ACTION_ICON_CASE = 'utility:case';
  private static final String ACTION_ICON_EVENT = 'utility:event';
  private static final String ACTION_ICON_COMPANY = 'utility:company';
  
  private static final String PARSE_DELIMITER_COMMA = ',';
  
  // ==================== ERROR MESSAGES ====================
  private static final String ERROR_DASHBOARD_ID_OR_NAME_REQUIRED = 'Dashboard ID or Name is required';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_DASHBOARD = 'Insufficient permissions to access Dashboard';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT_GROUP = 'Insufficient permissions to access Dashboard Component Group';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT = 'Insufficient permissions to access Dashboard Component';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_DATA_SOURCE = 'Insufficient permissions to access Dashboard Data Source';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_DETAIL_MAP = 'Insufficient permissions to access Component Detail Map';
  private static final String ERROR_COMPONENT_GROUP_ID_REQUIRED = 'Component Group ID is required';
  private static final String ERROR_COMPONENT_ID_REQUIRED = 'Component ID is required';
  private static final String ERROR_RETRIEVING_DASHBOARD_CONFIG = 'Error retrieving dashboard configuration: {0}';
  private static final String ERROR_RETRIEVING_COMPONENT_GROUP_CONFIG = 'Error retrieving component group configuration: {0}';
  private static final String ERROR_RETRIEVING_COMPONENT_CONFIG = 'Error retrieving component configuration: {0}';
  private static final String ERROR_INVALID_CUSTOM_ACTIONS_JSON = 'Invalid custom actions JSON format: {0}';
  private static final String ERROR_PARSING_CUSTOM_ACTIONS = 'Error parsing custom actions: {0}';
  
  /**
   * @description Get complete dashboard configuration including all groups and components
   * @param dashboardIdOrName Dashboard record ID or Name
   * @return Map containing dashboard structure with groups and components
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getDashboardConfiguration(
    String dashboardIdOrName
  ) {
    // Input validation
    if (String.isBlank(dashboardIdOrName)) {
      throw new AuraHandledException(ERROR_DASHBOARD_ID_OR_NAME_REQUIRED);
    }

    try {
      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_DASHBOARD);
      }

      // Try to find by ID first, then by Name
      HM_Dashboard__c dashboard = findDashboardByIdOrName(dashboardIdOrName);
      if (dashboard == null) {
        return null;
      }

      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Component_Group__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT_GROUP);
      }

      // Get component groups for this dashboard (using direct lookup)
      List<HM_Dashboard_Component_Group__c> componentGroups = [
        SELECT
          Id,
          Name,
          HM_Display_Order__c,
          HM_Component_Type__c,
          HM_Layout_Type__c,
          HM_Max_Components__c
        FROM HM_Dashboard_Component_Group__c
        WHERE HM_Dashboard__c = :dashboard.Id
        ORDER BY HM_Display_Order__c ASC NULLS LAST
      ];

      // Build response structure
      Map<String, Object> result = new Map<String, Object>();
      Map<String, Object> dashboardMap = buildDashboardMap(dashboard);

      // Build actions configuration
      List<Map<String, Object>> standardActions = buildStandardActions(
        dashboard
      );
      List<Map<String, Object>> customActions = parseCustomActions(
        dashboard.HM_Custom_Actions_Configuration__c
      );
      List<Map<String, Object>> allActions = new List<Map<String, Object>>();
      allActions.addAll(standardActions);
      allActions.addAll(customActions);

      dashboardMap.put('actions', allActions);
      dashboardMap.put(
        'showActionsMenu',
        dashboard.HM_Show_Actions_Menu__c != null
          ? dashboard.HM_Show_Actions_Menu__c
          : true
      );
      dashboardMap.put(
        'defaultDarkMode',
        dashboard.HM_Default_Dark_Mode__c != null
          ? dashboard.HM_Default_Dark_Mode__c
          : false
      );
      dashboardMap.put(
        'enableDarkMode',
        dashboard.HM_Enable_Dark_Mode__c != null
          ? dashboard.HM_Enable_Dark_Mode__c
          : true
      );

      result.put('dashboard', dashboardMap);

      List<Map<String, Object>> groups = new List<Map<String, Object>>();
      for (HM_Dashboard_Component_Group__c componentGroup : componentGroups) {
        Map<String, Object> groupConfig = getComponentGroupConfiguration(
          componentGroup.Id
        );
        if (groupConfig != null) {
          groups.add(groupConfig);
        }
      }
      result.put('groups', groups);

      return result;
    } catch (Exception ex) {
      throw new AuraHandledException(
        String.format(ERROR_RETRIEVING_DASHBOARD_CONFIG, new List<String>{ ex.getMessage() })
      );
    }
  }

  /**
   * @description Get component group configuration with all its components
   * @param groupId Component Group record ID
   * @return Map containing group structure with components
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getComponentGroupConfiguration(Id groupId) {
    // Input validation
    if (groupId == null) {
      throw new AuraHandledException(ERROR_COMPONENT_GROUP_ID_REQUIRED);
    }

    try {
      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Component_Group__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT_GROUP);
      }

      HM_Dashboard_Component_Group__c componentGroup = [
        SELECT
          Id,
          Name,
          HM_Display_Order__c,
          HM_Component_Type__c,
          HM_Layout_Type__c,
          HM_Max_Components__c
        FROM HM_Dashboard_Component_Group__c
        WHERE Id = :groupId
        LIMIT 1
      ];

      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Component__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT);
      }

      // Get components for this group (using direct lookup)
      List<HM_Dashboard_Component__c> components = [
        SELECT Id
        FROM HM_Dashboard_Component__c
        WHERE HM_Dashboard_Component_Group__c = :groupId AND HM_Active__c = TRUE
        ORDER BY HM_Display_Order__c ASC NULLS LAST
      ];

      // Build response structure
      Map<String, Object> result = buildComponentGroupMap(componentGroup);

      List<Map<String, Object>> componentConfigs = new List<Map<String, Object>>();
      for (HM_Dashboard_Component__c component : components) {
        Map<String, Object> componentConfig = getComponentConfiguration(
          component.Id
        );
        if (componentConfig != null) {
          componentConfigs.add(componentConfig);
        }
      }
      result.put('components', componentConfigs);

      return result;
    } catch (Exception ex) {
      throw new AuraHandledException(
        String.format(ERROR_RETRIEVING_COMPONENT_GROUP_CONFIG, new List<String>{ ex.getMessage() })
      );
    }
  }

  /**
   * @description Get component configuration with all detail maps
   * @param componentId Component record ID
   * @return Map containing component structure with detail maps
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getComponentConfiguration(Id componentId) {
    // Input validation
    if (componentId == null) {
      throw new AuraHandledException(ERROR_COMPONENT_ID_REQUIRED);
    }

    try {
      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Component__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_COMPONENT);
      }

      // Build dynamic SOQL query based on field existence and accessibility
      List<String> queryFields = buildComponentQueryFields();
      if (queryFields.isEmpty()) {
        throw new AuraHandledException('No accessible fields found for HM_Dashboard_Component__c');
      }

      String soqlQuery = 'SELECT ' + String.join(queryFields, ', ') + 
        ' FROM HM_Dashboard_Component__c' +
        ' WHERE Id = :componentId AND HM_Active__c = TRUE' +
        ' LIMIT 1';
      
      List<HM_Dashboard_Component__c> components = Database.query(soqlQuery);
      HM_Dashboard_Component__c component = components.isEmpty() ? null : components[0];

      if (component == null) {
        return null;
      }

      // Check object accessibility
      if (!Schema.sObjectType.HM_Dashboard_Data_Source__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_DATA_SOURCE);
      }

      // Get Data Sources for this component
      List<HM_Dashboard_Data_Source__c> dataSources = [
        SELECT
          Id,
          Name,
          HM_Type__c,
          HM_SOQL_Query__c,
          HM_Apex_Class_Name__c,
          HM_Apex_Method_Name__c,
          HM_Return_Type__c,
          HM_Active__c,
          HM_Order__c,
          HM_Row_Icon_Name__c
        FROM HM_Dashboard_Data_Source__c
        WHERE HM_Dashboard_Component__c = :componentId
          AND HM_Active__c = TRUE
        ORDER BY HM_Order__c ASC NULLS LAST
      ];

      // Check object accessibility
      if (!Schema.sObjectType.HM_Component_Detail_Map__c.isAccessible()) {
        throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_DETAIL_MAP);
      }

      // Get detail maps for this component
      List<HM_Component_Detail_Map__c> detailMaps = [
        SELECT
          Id,
          HM_Field_API_Name__c,
          HM_Label__c,
          HM_Map_Type__c,
          HM_Display_Order__c,
          HM_Format_Type__c,
          HM_Data_Source_Name__c,
          HM_Column_Badge_Type__c,
          HM_Column_Badge_Variant__c,
          HM_Object_Type__c
        FROM HM_Component_Detail_Map__c
        WHERE HM_Dashboard_Component__c = :componentId
        ORDER BY HM_Display_Order__c ASC NULLS LAST
      ];

      // Build response structure
      Map<String, Object> result = buildComponentMap(component);

      // Add Data Sources
      List<Map<String, Object>> dataSourceMaps = new List<Map<String, Object>>();
      for (HM_Dashboard_Data_Source__c dataSource : dataSources) {
        dataSourceMaps.add(buildDataSourceMap(dataSource));
      }
      result.put('dataSources', dataSourceMaps);

      // Add Detail Maps
      List<Map<String, Object>> maps = new List<Map<String, Object>>();
      for (HM_Component_Detail_Map__c detailMap : detailMaps) {
        // Note: Data source name validation happens at runtime during data processing
        // If data source name doesn't match, component will gracefully degrade
        maps.add(buildDetailMapMap(detailMap));
      }
      result.put('detailMaps', maps);

      return result;
    } catch (Exception ex) {
      throw new AuraHandledException(
        String.format(ERROR_RETRIEVING_COMPONENT_CONFIG, new List<String>{ ex.getMessage() })
      );
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * @description Find dashboard by ID or Name
   * @param dashboardIdOrName Dashboard ID (15 or 18 chars) or Name
   * @return HM_Dashboard__c Dashboard record, or null if not found
   */
  private static HM_Dashboard__c findDashboardByIdOrName(String dashboardIdOrName) {
    if (String.isBlank(dashboardIdOrName)) {
      return null;
    }

    Boolean isId = dashboardIdOrName.length() == SALESFORCE_ID_LENGTH_15 ||
                   dashboardIdOrName.length() == SALESFORCE_ID_LENGTH_18;

    List<String> fields = new List<String>{
      'Id', 'Name', 'HM_Description__c', 'HM_Active__c', 'HM_Display_Order__c',
      'HM_Show_New_Opportunity_Action__c', 'HM_Show_New_Case_Action__c',
      'HM_Show_Schedule_Meeting_Action__c', 'HM_Show_New_Account_Action__c',
      'HM_Custom_Actions_Configuration__c', 'HM_Show_Actions_Menu__c',
      'HM_Default_Dark_Mode__c', 'HM_Enable_Dark_Mode__c'
    };

    String query = 'SELECT ' + String.join(fields, ', ') +
                   ' FROM HM_Dashboard__c' +
                   ' WHERE HM_Active__c = TRUE';

    if (isId) {
      query += ' AND Id = :dashboardIdOrName';
    } else {
      query += ' AND Name = :dashboardIdOrName';
    }

    query += ' LIMIT 1';

    List<HM_Dashboard__c> dashboards = Database.query(query);
    return dashboards.isEmpty() ? null : dashboards[0];
  }

  /**
   * @description Build map from Dashboard record for API response
   * @param dashboard Dashboard SObject record
   * @return Map<String, Object> Dashboard configuration map with camelCase keys
   */
  private static Map<String, Object> buildDashboardMap(
    HM_Dashboard__c dashboard
  ) {
    Map<String, Object> mapData = new Map<String, Object>();
    mapData.put('id', dashboard.Id);
    mapData.put('name', dashboard.Name);
    mapData.put('description', dashboard.HM_Description__c);
    mapData.put('active', dashboard.HM_Active__c);
    mapData.put('displayOrder', dashboard.HM_Display_Order__c);
    return mapData;
  }

  /**
   * @description Build map from Component Group record for API response
   * @param componentGroup Component Group SObject record
   * @return Map<String, Object> Component Group configuration map with camelCase keys
   */
  private static Map<String, Object> buildComponentGroupMap(
    HM_Dashboard_Component_Group__c componentGroup
  ) {
    Map<String, Object> mapData = new Map<String, Object>();
    mapData.put('id', componentGroup.Id);
    mapData.put('name', componentGroup.Name);
    mapData.put('displayOrder', componentGroup.HM_Display_Order__c);
    mapData.put('componentType', componentGroup.HM_Component_Type__c);
    mapData.put('layoutType', componentGroup.HM_Layout_Type__c);
    mapData.put('maxComponents', componentGroup.HM_Max_Components__c);
    return mapData;
  }

  /**
   * @description Build map from Component record for API response
   * Includes pagination, sorting, and row icon configuration
   * @param component Component SObject record
   * @return Map<String, Object> Component configuration map with camelCase keys
   */
  private static Map<String, Object> buildComponentMap(
    HM_Dashboard_Component__c component
  ) {
    Map<String, Object> mapData = new Map<String, Object>();
    mapData.put('id', component.Id);
    mapData.put('name', component.Name);
    mapData.put('displayOrder', component.HM_Display_Order__c);
    mapData.put('type', component.HM_Type__c);
    mapData.put('title', component.HM_Title__c);
    mapData.put('subtitle', component.HM_Subtitle__c);
    mapData.put('active', component.HM_Active__c);
    
    // Only set iconName if field exists and has value
    String iconName = getFieldValueSafely(component, 'HM_Icon_Name__c');
    mapData.put('iconName', String.isNotBlank(iconName) ? iconName : null);
    
    // Only set iconBackgroundColor if field exists and has value
    String iconBgColor = getFieldValueSafely(component, 'HM_Icon_Background_Color__c');
    mapData.put('iconBackgroundColor', String.isNotBlank(iconBgColor) ? iconBgColor : null);
    
    // Pagination configuration
    mapData.put('enablePagination', component.HM_Enable_List_Pagination__c == true);
    mapData.put('recordsPerPage', component.HM_Records_Per_Page__c != null 
      ? Integer.valueOf(component.HM_Records_Per_Page__c) 
      : DEFAULT_RECORDS_PER_PAGE);
    
    // Column sorting configuration
    mapData.put('enableColumnSorting', component.HM_Enable_Column_Sorting__c == true);
    
    return mapData;
  }

  /**
   * @description Build map from Data Source record
   * @param dataSource Data Source record
   * @return Map<String, Object> Data Source configuration map
   */
  private static Map<String, Object> buildDataSourceMap(
    HM_Dashboard_Data_Source__c dataSource
  ) {
    Map<String, Object> mapData = new Map<String, Object>();
    mapData.put('id', dataSource.Id);
    mapData.put('name', dataSource.Name);
    mapData.put('type', dataSource.HM_Type__c);
    mapData.put('soqlQuery', dataSource.HM_SOQL_Query__c);
    mapData.put('apexClassName', dataSource.HM_Apex_Class_Name__c);
    mapData.put('apexMethodName', dataSource.HM_Apex_Method_Name__c);
    mapData.put('returnType', dataSource.HM_Return_Type__c);
    mapData.put('active', dataSource.HM_Active__c);
    mapData.put('order', dataSource.HM_Order__c);
    
    // Only set rowIconName if field exists and has value
    String rowIconName = getFieldValueSafely(dataSource, 'HM_Row_Icon_Name__c');
    mapData.put('rowIconName', String.isNotBlank(rowIconName) ? rowIconName : null);
    
    return mapData;
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
   * @description Build list of field names for component SOQL query
   * Dynamically checks field existence and FLS accessibility
   * @return List<String> Field names to include in SOQL query
   */
  private static List<String> buildComponentQueryFields() {
    List<String> fields = new List<String>{
      'Id',
      'Name',
      'HM_Display_Order__c',
      'HM_Type__c',
      'HM_Title__c',
      'HM_Subtitle__c',
      'HM_Active__c',
      'HM_Enable_List_Pagination__c',
      'HM_Records_Per_Page__c',
      'HM_Enable_Column_Sorting__c'
    };
    
    // Check if HM_Icon_Name__c exists and is accessible
    try {
      Schema.DescribeFieldResult iconNameField = Schema.sObjectType.HM_Dashboard_Component__c
        .fields.HM_Icon_Name__c;
      if (iconNameField.isAccessible()) {
        fields.add('HM_Icon_Name__c');
      }
    } catch (SObjectException ex) {
      // Graceful degradation: field doesn't exist - skip it
    }
    
    // Check if HM_Icon_Background_Color__c exists and is accessible
    try {
      Schema.DescribeFieldResult iconBgColorField = Schema.sObjectType.HM_Dashboard_Component__c
        .fields.HM_Icon_Background_Color__c;
      if (iconBgColorField.isAccessible()) {
        fields.add('HM_Icon_Background_Color__c');
      }
    } catch (SObjectException ex) {
      // Graceful degradation: field doesn't exist - skip it
    }
    
    return fields;
  }

  /**
   * @description Build map from Detail Map record for API response
   * Parses object type list and includes badge configuration
   * @param detailMap Detail Map SObject record
   * @return Map<String, Object> Detail Map configuration map with camelCase keys
   */
  private static Map<String, Object> buildDetailMapMap(
    HM_Component_Detail_Map__c detailMap
  ) {
    Map<String, Object> mapData = new Map<String, Object>();
    mapData.put('id', detailMap.Id);
    mapData.put('fieldApiName', detailMap.HM_Field_API_Name__c);
    mapData.put('label', detailMap.HM_Label__c);
    mapData.put('mapType', detailMap.HM_Map_Type__c);
    mapData.put('displayOrder', detailMap.HM_Display_Order__c);
    mapData.put('formatType', detailMap.HM_Format_Type__c);
    mapData.put('dataSourceName', detailMap.HM_Data_Source_Name__c);
    mapData.put('columnBadgeType', detailMap.HM_Column_Badge_Type__c);
    mapData.put('columnBadgeVariant', detailMap.HM_Column_Badge_Variant__c);
    
    // Parse object type from comma-separated string to List<String>
    List<String> objectTypes = parseObjectTypeList(detailMap.HM_Object_Type__c);
    mapData.put('objectType', objectTypes);
    
    return mapData;
  }

  /**
   * @description Parse comma-separated object type string to List<String>
   * Used to determine which object types a detail map column applies to
   * @param objectTypeString Comma-separated object API names (e.g., "Account,Contact")
   * @return List<String> List of object API names, empty list if blank (applies to all)
   */
  private static List<String> parseObjectTypeList(String objectTypeString) {
    List<String> objectTypes = new List<String>();
    
    if (String.isBlank(objectTypeString)) {
      return objectTypes; // Empty list means applies to all
    }
    
    try {
      List<String> parts = objectTypeString.split(PARSE_DELIMITER_COMMA);
      for (String part : parts) {
        String trimmed = part.trim();
        if (String.isNotBlank(trimmed)) {
          objectTypes.add(trimmed);
        }
      }
    } catch (Exception ex) {
      return objectTypes;
    }
    
    return objectTypes;
  }

  /**
   * @description Build standard actions array from boolean fields on Dashboard
   * Creates navigation actions for New Opportunity, New Case, Schedule Meeting, New Account
   * @param dashboard Dashboard record with action visibility flags
   * @return List<Map<String, Object>> List of action configuration maps
   */
  private static List<Map<String, Object>> buildStandardActions(
    HM_Dashboard__c dashboard
  ) {
    List<Map<String, Object>> actions = new List<Map<String, Object>>();

    if (dashboard.HM_Show_New_Opportunity_Action__c == true) {
      actions.add(
        new Map<String, Object>{
          'label' => ACTION_LABEL_LOG_OPPORTUNITY,
          'icon' => ACTION_ICON_MONEYBAG,
          'type' => ACTION_TYPE_NAVIGATION,
          'target' => new Map<String, Object>{
            'objectApiName' => OBJECT_API_OPPORTUNITY,
            'actionName' => ACTION_NAME_NEW
          }
        }
      );
    }

    if (dashboard.HM_Show_New_Case_Action__c == true) {
      actions.add(
        new Map<String, Object>{
          'label' => ACTION_LABEL_CREATE_CASE,
          'icon' => ACTION_ICON_CASE,
          'type' => ACTION_TYPE_NAVIGATION,
          'target' => new Map<String, Object>{
            'objectApiName' => OBJECT_API_CASE,
            'actionName' => ACTION_NAME_NEW
          }
        }
      );
    }

    if (dashboard.HM_Show_Schedule_Meeting_Action__c == true) {
      actions.add(
        new Map<String, Object>{
          'label' => ACTION_LABEL_SCHEDULE_MEETING,
          'icon' => ACTION_ICON_EVENT,
          'type' => ACTION_TYPE_NAVIGATION,
          'target' => new Map<String, Object>{
            'objectApiName' => OBJECT_API_EVENT,
            'actionName' => ACTION_NAME_NEW
          }
        }
      );
    }

    if (dashboard.HM_Show_New_Account_Action__c == true) {
      actions.add(
        new Map<String, Object>{
          'label' => ACTION_LABEL_ADD_ACCOUNT,
          'icon' => ACTION_ICON_COMPANY,
          'type' => ACTION_TYPE_NAVIGATION,
          'target' => new Map<String, Object>{
            'objectApiName' => OBJECT_API_ACCOUNT,
            'actionName' => ACTION_NAME_NEW
          }
        }
      );
    }

    return actions;
  }

  /**
   * @description Parse custom actions from JSON configuration
   * @param customActionsJson JSON string containing custom actions array
   * @return List of action maps, empty list if JSON is invalid or null
   */
  private static List<Map<String, Object>> parseCustomActions(
    String customActionsJson
  ) {
    List<Map<String, Object>> actions = new List<Map<String, Object>>();

    if (String.isBlank(customActionsJson)) {
      return actions;
    }

    try {
      Object parsed = JSON.deserializeUntyped(customActionsJson);
      if (parsed instanceof List<Object>) {
        List<Object> actionList = (List<Object>) parsed;
        for (Object actionObj : actionList) {
          if (actionObj instanceof Map<String, Object>) {
            actions.add((Map<String, Object>) actionObj);
          }
        }
      }
    } catch (JSONException ex) {
      throw new AuraHandledException(
        String.format(ERROR_INVALID_CUSTOM_ACTIONS_JSON, new List<String>{ ex.getMessage() })
      );
    } catch (Exception ex) {
      throw new AuraHandledException(
        String.format(ERROR_PARSING_CUSTOM_ACTIONS, new List<String>{ ex.getMessage() })
      );
    }

    return actions;
  }
}