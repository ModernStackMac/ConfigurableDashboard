/**
 * @description Test data provider for dashboard components
 * Provides example methods demonstrating Map<String, List<SObject>> pattern
 * for multi-object list components
 * Implements Callable interface for dynamic invocation
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_DashboardTestData implements Callable {
  // ==================== CONSTANTS ====================
  private static final String OBJECT_TYPE_ACCOUNT = 'Account';
  private static final String OBJECT_TYPE_OPPORTUNITY = 'Opportunity';
  private static final String OBJECT_TYPE_CASE = 'Case';
  
  private static final Integer DEFAULT_RECORD_LIMIT = 100;
  
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_ACCOUNT = 'Insufficient permissions to access Account';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY = 'Insufficient permissions to access Opportunity';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_CASE = 'Insufficient permissions to access Case';
  private static final String ERROR_METHOD_NOT_FOUND = 'Method not found in HM_DashboardTestData: {0}';
  
  /**
   * @description Call method via Callable interface
   * @param action Method name to call
   * @param args Map of parameters (not used for test methods)
   * @return Object Result from the method call
   */
  public Object call(String action, Map<String, Object> args) {
    switch on action {
      when 'getMultiObjectTestData' {
        return getMultiObjectTestData();
      }
      when else {
        throw new AuraHandledException(
          String.format(ERROR_METHOD_NOT_FOUND, new List<String>{ action })
        );
      }
    }
  }

  /**
   * @description Get multi-object test data using Map<String, List<SObject>> pattern
   * Demonstrates how to return data from multiple objects in a single call
   * @return Map<String, List<SObject>> Map where keys are object API names and values are SObject lists
   */
  public static Map<String, List<SObject>> getMultiObjectTestData() {
    // Check object accessibility
    if (!Schema.sObjectType.Account.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_ACCOUNT);
    }
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }
    if (!Schema.sObjectType.Case.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_CASE);
    }

    Map<String, List<SObject>> buckets = new Map<String, List<SObject>>{
      OBJECT_TYPE_ACCOUNT => new List<SObject>(),
      OBJECT_TYPE_OPPORTUNITY => new List<SObject>(),
      OBJECT_TYPE_CASE => new List<SObject>()
    };

    List<Account> accounts = [
      SELECT Id, Name, Client_Code__c, Family_Status__c
      FROM Account
      WHERE Client_Code__c != null AND Family_Status__c != null
      LIMIT :DEFAULT_RECORD_LIMIT
    ];
    buckets.get(OBJECT_TYPE_ACCOUNT).addAll(accounts);

    List<Opportunity> opportunities = [
      SELECT Id, Name, Account_Name__c, StageName, Amount, closedate
      FROM Opportunity
      WHERE Amount != null AND StageName != null AND OwnerId = :UserInfo.getUserId()
      LIMIT :DEFAULT_RECORD_LIMIT
    ];
    buckets.get(OBJECT_TYPE_OPPORTUNITY).addAll(opportunities);

    List<Case> cases = [
      SELECT Id, CaseNumber, Account.Name, Priority, Origin
      FROM Case
      WHERE Priority != null AND Origin != null AND OwnerId = :UserInfo.getUserId()
      LIMIT :DEFAULT_RECORD_LIMIT
    ];
    buckets.get(OBJECT_TYPE_CASE).addAll(cases);

    return buckets;
  }



  public static Decimal getTotalWonAmount() {
    List<AggregateResult> results = [
      SELECT SUM(Amount) totalWon
      FROM Opportunity
      WHERE IsWon = true
      AND OwnerId = :UserInfo.getUserId()
  ];

  Decimal totalWonAmount = (Decimal) results[0].get('totalWon');
  return totalWonAmount == null ? 0 : totalWonAmount;
}
}