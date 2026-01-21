/**
 * @description Test class for HM_DataSourceBuilderService
 * @author High Meadows
 * @date 2024
 */
@IsTest
private class HM_DataSourceBuilderServiceTest {
  
  /**
   * @description Test getAccessibleObjects returns accessible objects
   */
  @IsTest
  static void testGetAccessibleObjects() {
    List<HM_DataSourceBuilderService.ObjectInfo> objects;
    
    Test.startTest();
    objects = HM_DataSourceBuilderService.getAccessibleObjects();
    Test.stopTest();
    
    // Should return at least standard objects like Account
    System.assertNotEquals(0, objects.size(), 'Should return accessible objects');
    
    // Verify structure and find Account
    Boolean foundAccount = false;
    for (HM_DataSourceBuilderService.ObjectInfo obj : objects) {
      System.assertNotEquals(null, obj.apiName, 'API name should not be null');
      System.assertNotEquals(null, obj.label, 'Label should not be null');
      System.assertNotEquals(null, obj.isCustom, 'isCustom should not be null');
      if (obj.apiName == 'Account') {
        foundAccount = true;
        System.assertEquals(false, obj.isCustom, 'Account should not be custom');
      }
    }
    System.assert(foundAccount, 'Should include Account object');
  }
  
  /**
   * @description Test getObjectFields returns fields with metadata
   */
  @IsTest
  static void testGetObjectFields() {
    List<HM_DataSourceBuilderService.FieldInfo> fields;
    
    Test.startTest();
    fields = HM_DataSourceBuilderService.getObjectFields('Account');
    Test.stopTest();
    
    // Should return fields for Account
    System.assertNotEquals(0, fields.size(), 'Should return fields for Account');
    
    // Verify structure
    Boolean foundNameField = false;
    Boolean foundIndustryField = false;
    
    for (HM_DataSourceBuilderService.FieldInfo field : fields) {
      System.assertNotEquals(null, field.apiName, 'API name should not be null');
      System.assertNotEquals(null, field.label, 'Label should not be null');
      System.assertNotEquals(null, field.type, 'Type should not be null');
      System.assertNotEquals(null, field.isFilterable, 'isFilterable should not be null');
      
      if (field.apiName == 'Name') {
        foundNameField = true;
        System.assertEquals(true, field.isFilterable, 'Name field should be filterable');
      }
      
      if (field.apiName == 'Industry') {
        foundIndustryField = true;
        System.assertEquals('PICKLIST', field.type, 'Industry should be PICKLIST type');
        System.assertNotEquals(null, field.picklistValues, 'Industry should have picklist values');
        System.assert(field.picklistValues.size() > 0, 'Industry should have at least one picklist value');
      }
    }
    
    System.assert(foundNameField, 'Should include Name field');
    System.assert(foundIndustryField, 'Should include Industry field');
  }
  
  /**
   * @description Test getObjectFields with blank object name returns empty list
   */
  @IsTest
  static void testGetObjectFieldsBlankName() {
    List<HM_DataSourceBuilderService.FieldInfo> fields;
    
    Test.startTest();
    fields = HM_DataSourceBuilderService.getObjectFields('');
    Test.stopTest();
    
    System.assertEquals(0, fields.size(), 'Should return empty list for blank object name');
  }
  
  /**
   * @description Test getObjectFields with null object name returns empty list
   */
  @IsTest
  static void testGetObjectFieldsNullName() {
    List<HM_DataSourceBuilderService.FieldInfo> fields;
    
    Test.startTest();
    fields = HM_DataSourceBuilderService.getObjectFields(null);
    Test.stopTest();
    
    System.assertEquals(0, fields.size(), 'Should return empty list for null object name');
  }
  
  /**
   * @description Test getObjectFields with invalid object throws exception
   */
  @IsTest
  static void testGetObjectFieldsInvalidObject() {
    Boolean exceptionThrown = false;
    
    Test.startTest();
    try {
      HM_DataSourceBuilderService.getObjectFields('InvalidObject__xyz');
    } catch (AuraHandledException e) {
      exceptionThrown = true;
      System.assert(e.getMessage().contains('Object not accessible'), 'Should indicate object not accessible');
    }
    Test.stopTest();
    
    System.assert(exceptionThrown, 'Should throw exception for invalid object');
  }
  
  /**
   * @description Test FieldInfo isFilterable property is correctly populated
   */
  @IsTest
  static void testFieldInfoIsFilterable() {
    List<HM_DataSourceBuilderService.FieldInfo> fields;
    
    Test.startTest();
    fields = HM_DataSourceBuilderService.getObjectFields('Account');
    Test.stopTest();
    
    // Find Id field - should always be filterable
    for (HM_DataSourceBuilderService.FieldInfo field : fields) {
      if (field.apiName == 'Id') {
        System.assertEquals(true, field.isFilterable, 'Id field should be filterable');
        break;
      }
    }
  }
  
  /**
   * @description Test PicklistValue class structure
   */
  @IsTest
  static void testPicklistValueStructure() {
    List<HM_DataSourceBuilderService.FieldInfo> fields;
    
    Test.startTest();
    fields = HM_DataSourceBuilderService.getObjectFields('Account');
    Test.stopTest();
    
    // Find Industry field and verify picklist values
    for (HM_DataSourceBuilderService.FieldInfo field : fields) {
      if (field.apiName == 'Industry' && field.picklistValues != null) {
        for (HM_DataSourceBuilderService.PicklistValue pv : field.picklistValues) {
          System.assertNotEquals(null, pv.label, 'Picklist value label should not be null');
          System.assertNotEquals(null, pv.value, 'Picklist value should not be null');
        }
        break;
      }
    }
  }
  
  /**
   * @description Test ObjectInfo compareTo for sorting
   */
  @IsTest
  static void testObjectInfoCompareTo() {
    HM_DataSourceBuilderService.ObjectInfo obj1 = new HM_DataSourceBuilderService.ObjectInfo();
    HM_DataSourceBuilderService.ObjectInfo obj2 = new HM_DataSourceBuilderService.ObjectInfo();
    
    // Both null labels
    obj1.label = null;
    obj2.label = null;
    System.assertEquals(0, obj1.compareTo(obj2), 'Both null should return 0');
    
    // First null
    obj1.label = null;
    obj2.label = 'Account';
    System.assertEquals(1, obj1.compareTo(obj2), 'First null should return 1');
    
    // Second null
    obj1.label = 'Account';
    obj2.label = null;
    System.assertEquals(-1, obj1.compareTo(obj2), 'Second null should return -1');
    
    // Normal comparison
    obj1.label = 'Account';
    obj2.label = 'Contact';
    System.assert(obj1.compareTo(obj2) < 0, 'Account should come before Contact');
  }
  
  /**
   * @description Test FieldInfo compareTo for sorting
   */
  @IsTest
  static void testFieldInfoCompareTo() {
    HM_DataSourceBuilderService.FieldInfo field1 = new HM_DataSourceBuilderService.FieldInfo();
    HM_DataSourceBuilderService.FieldInfo field2 = new HM_DataSourceBuilderService.FieldInfo();
    
    // Both null labels
    field1.label = null;
    field2.label = null;
    System.assertEquals(0, field1.compareTo(field2), 'Both null should return 0');
    
    // First null
    field1.label = null;
    field2.label = 'Name';
    System.assertEquals(1, field1.compareTo(field2), 'First null should return 1');
    
    // Second null
    field1.label = 'Name';
    field2.label = null;
    System.assertEquals(-1, field1.compareTo(field2), 'Second null should return -1');
    
    // Normal comparison
    field1.label = 'Account Name';
    field2.label = 'Industry';
    System.assert(field1.compareTo(field2) < 0, 'Account Name should come before Industry');
  }
  
  /**
   * @description Test executePreviewQuery with valid parameters
   */
  @IsTest
  static void testExecutePreviewQueryValid() {
    // Create test data
    List<Account> testAccounts = new List<Account>();
    for (Integer i = 0; i < 10; i++) {
      testAccounts.add(new Account(Name = 'Test Account ' + i));
    }
    insert testAccounts;
    
    List<String> fields = new List<String>{ 'Id', 'Name' };
    
    Test.startTest();
    HM_DataSourceBuilderService.QueryResult result = HM_DataSourceBuilderService.executePreviewQuery(
      'Account',
      fields,
      null,
      null
    );
    Test.stopTest();
    
    // Verify result structure
    System.assertNotEquals(null, result, 'Result should not be null');
    System.assertNotEquals(null, result.columns, 'Columns should not be null');
    System.assertNotEquals(null, result.rows, 'Rows should not be null');
    System.assertEquals(2, result.columns.size(), 'Should have 2 columns (Id, Name)');
    System.assertEquals(5, result.rows.size(), 'Should return max 5 rows for preview');
    System.assert(result.totalCount >= 10, 'Total count should include all records');
    
    // Verify Id is first column
    System.assertEquals('Id', result.columns[0].apiName, 'First column should be Id');
  }
  
  /**
   * @description Test executePreviewQuery with WHERE clause
   */
  @IsTest
  static void testExecutePreviewQueryWithWhere() {
    // Create test data
    Account testAccount = new Account(Name = 'UniqueTestName123');
    insert testAccount;
    
    List<String> fields = new List<String>{ 'Name' };
    String whereClause = 'Name = \'UniqueTestName123\'';
    
    Test.startTest();
    HM_DataSourceBuilderService.QueryResult result = HM_DataSourceBuilderService.executePreviewQuery(
      'Account',
      fields,
      whereClause,
      null
    );
    Test.stopTest();
    
    System.assertNotEquals(null, result, 'Result should not be null');
    System.assertEquals(1, result.totalCount, 'Should find 1 matching record');
    System.assertEquals(1, result.rows.size(), 'Should return 1 row');
  }
  
  /**
   * @description Test executePreviewQuery with query limit
   */
  @IsTest
  static void testExecutePreviewQueryWithLimit() {
    // Create test data
    List<Account> testAccounts = new List<Account>();
    for (Integer i = 0; i < 20; i++) {
      testAccounts.add(new Account(Name = 'Limit Test ' + i));
    }
    insert testAccounts;
    
    List<String> fields = new List<String>{ 'Name' };
    
    Test.startTest();
    HM_DataSourceBuilderService.QueryResult result = HM_DataSourceBuilderService.executePreviewQuery(
      'Account',
      fields,
      null,
      10 // User limit of 10
    );
    Test.stopTest();
    
    // Total count should respect user's limit
    System.assertEquals(10, result.totalCount, 'Total count should respect user limit');
    // But preview should still only show 5 rows
    System.assertEquals(5, result.rows.size(), 'Preview should still show max 5 rows');
  }
  
  /**
   * @description Test executePreviewQuery with blank object name throws exception
   */
  @IsTest
  static void testExecutePreviewQueryBlankObject() {
    Boolean exceptionThrown = false;
    
    Test.startTest();
    try {
      HM_DataSourceBuilderService.executePreviewQuery(
        '',
        new List<String>{ 'Name' },
        null,
        null
      );
    } catch (AuraHandledException e) {
      exceptionThrown = true;
      System.assert(e.getMessage().contains('Object API name is required'), 'Should indicate object required');
    }
    Test.stopTest();
    
    System.assert(exceptionThrown, 'Should throw exception for blank object');
  }
  
  /**
   * @description Test executePreviewQuery with empty fields throws exception
   */
  @IsTest
  static void testExecutePreviewQueryEmptyFields() {
    Boolean exceptionThrown = false;
    
    Test.startTest();
    try {
      HM_DataSourceBuilderService.executePreviewQuery(
        'Account',
        new List<String>(),
        null,
        null
      );
    } catch (AuraHandledException e) {
      exceptionThrown = true;
      System.assert(e.getMessage().contains('At least one field is required'), 'Should indicate fields required');
    }
    Test.stopTest();
    
    System.assert(exceptionThrown, 'Should throw exception for empty fields');
  }
  
  /**
   * @description Test executePreviewQuery with invalid object throws exception
   */
  @IsTest
  static void testExecutePreviewQueryInvalidObject() {
    Boolean exceptionThrown = false;
    
    Test.startTest();
    try {
      HM_DataSourceBuilderService.executePreviewQuery(
        'InvalidObject__xyz',
        new List<String>{ 'Name' },
        null,
        null
      );
    } catch (AuraHandledException e) {
      exceptionThrown = true;
      System.assert(e.getMessage().contains('Object not accessible'), 'Should indicate object not accessible');
    }
    Test.stopTest();
    
    System.assert(exceptionThrown, 'Should throw exception for invalid object');
  }
  
  /**
   * @description Test QueryResult and ColumnInfo class structure
   */
  @IsTest
  static void testQueryResultStructure() {
    // Test QueryResult
    HM_DataSourceBuilderService.QueryResult result = new HM_DataSourceBuilderService.QueryResult();
    result.columns = new List<HM_DataSourceBuilderService.ColumnInfo>();
    result.rows = new List<Map<String, Object>>();
    result.totalCount = 5;
    
    System.assertNotEquals(null, result.columns, 'Columns should be settable');
    System.assertNotEquals(null, result.rows, 'Rows should be settable');
    System.assertEquals(5, result.totalCount, 'Total count should be settable');
    
    // Test ColumnInfo
    HM_DataSourceBuilderService.ColumnInfo col = new HM_DataSourceBuilderService.ColumnInfo();
    col.apiName = 'Name';
    col.label = 'Account Name';
    col.type = 'STRING';
    
    System.assertEquals('Name', col.apiName, 'API name should be settable');
    System.assertEquals('Account Name', col.label, 'Label should be settable');
    System.assertEquals('STRING', col.type, 'Type should be settable');
  }
}
