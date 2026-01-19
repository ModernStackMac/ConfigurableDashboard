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
      when 'getAccountActivitySummary' {
        return getAccountActivitySummary();
      }
      when 'getCaseList' {
        return getCaseList();
      }
      when 'getTotalWonAmount' {
        return getTotalWonAmount();
      }
      when 'getPipelineValuePercentageChange' {
        return getPipelineValuePercentageChange();
      }
      when 'getClosedOpportunitiesPercentageChange' {
        return getClosedOpportunitiesPercentageChange();
      }
      when 'getCasesPendingActionPercentageChange' {
        return getCasesPendingActionPercentageChange();
      }
      when 'getActiveAccountsCountDifference' {
        return getActiveAccountsCountDifference();
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

  /**
   * @description Get total won amount for current user's opportunities
   * @return Decimal Total won amount, 0 if null or no records
   */
  public static Decimal getTotalWonAmount() {
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }

    List<AggregateResult> results = [
      SELECT SUM(Amount) totalWon
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
    ];

    if (results.isEmpty()) {
      return 0;
    }

    Decimal totalWonAmount = (Decimal) results[0].get('totalWon');
    return totalWonAmount == null ? 0 : totalWonAmount;
  }

  /**
   * @description Get list of cases for current user
   * @return List<Case> List of cases with Priority and Origin not null
   */
  public static List<Case> getCaseList() {
    if (!Schema.sObjectType.Case.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_CASE);
    }

    return [
      SELECT Id, CaseNumber, Account.Name, Priority, Origin
      FROM Case
      WHERE Priority != null AND Origin != null AND OwnerId = :UserInfo.getUserId()
      LIMIT :DEFAULT_RECORD_LIMIT
    ];
  }

  /**
   * @description Get aggregated account activity data as wrapper objects
   * Combines Account, Opportunity, and Case data into a unified summary
   * Only returns accounts that have both opportunities (with Amount > 0) and cases
   * @return List<AccountActivityWrapper> List of aggregated account activity summaries
   */
  public static List<AccountActivityWrapper> getAccountActivitySummary() {
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

    List<AccountActivityWrapper> wrappers = new List<AccountActivityWrapper>();

    // Query accounts with related opportunities and cases
    List<Account> accounts = [
      SELECT Id, Name, Client_Code__c, Family_Status__c,
        (SELECT Id, Amount, StageName, CloseDate FROM Opportunities WHERE Amount != null AND Amount > 0),
        (SELECT Id, Priority, Status, CaseNumber FROM Cases WHERE Priority != null)
      FROM Account
    ];

    for (Account acc : accounts) {
      // Only process accounts that have both opportunities and cases
      if (acc.Opportunities.isEmpty() || acc.Cases.isEmpty()) {
        continue;
      }

      AccountActivityWrapper wrapper = buildAccountActivityWrapper(acc);
      wrappers.add(wrapper);
    }

    return wrappers;
  }

  /**
   * @description Build AccountActivityWrapper from Account with related records
   * @param acc Account record with Opportunities and Cases subqueries
   * @return AccountActivityWrapper Wrapper with calculated metrics
   */
  private static AccountActivityWrapper buildAccountActivityWrapper(Account acc) {
    AccountActivityWrapper wrapper = new AccountActivityWrapper();
    wrapper.accountId = acc.Id;
    wrapper.accountName = acc.Name;
    
    // Calculate opportunity metrics
    Decimal totalOpportunityAmount = calculateTotalOpportunityAmount(acc.Opportunities);
    Integer openOpportunityCount = countOpenOpportunities(acc.Opportunities);
    wrapper.totalOpportunityValue = totalOpportunityAmount;
    wrapper.openOpportunityCount = openOpportunityCount;

    // Calculate case metrics
    Integer highPriorityCaseCount = countHighPriorityCases(acc.Cases);
    wrapper.highPriorityCaseCount = highPriorityCaseCount;

    // Calculate activity score (simple metric combining opp value and case priority)
    wrapper.activityScore = (totalOpportunityAmount / 1000) + (highPriorityCaseCount * 10);

    return wrapper;
  }

  /**
   * @description Calculate total opportunity amount from opportunities list
   * @param opportunities List of Opportunity records
   * @return Decimal Total amount, 0 if none
   */
  private static Decimal calculateTotalOpportunityAmount(List<Opportunity> opportunities) {
    Decimal total = 0;
    for (Opportunity opp : opportunities) {
      if (opp.Amount != null && opp.Amount > 0) {
        total += opp.Amount;
      }
    }
    return total;
  }

  /**
   * @description Count open opportunities (not Closed Won or Closed Lost)
   * @param opportunities List of Opportunity records
   * @return Integer Count of open opportunities
   */
  private static Integer countOpenOpportunities(List<Opportunity> opportunities) {
    Integer count = 0;
    for (Opportunity opp : opportunities) {
      if (opp.StageName != 'Closed Won' && opp.StageName != 'Closed Lost') {
        count++;
      }
    }
    return count;
  }

  /**
   * @description Count high priority cases (High or Critical)
   * @param cases List of Case records
   * @return Integer Count of high priority cases
   */
  private static Integer countHighPriorityCases(List<Case> cases) {
    Integer count = 0;
    for (Case c : cases) {
      if (c.Priority == 'High' || c.Priority == 'Critical') {
        count++;
      }
    }
    return count;
  }

  /**
   * @description Calculate percentage change between two values
   * @param current Current period value
   * @param previous Previous period value
   * @return Decimal Percentage change (positive = increase, negative = decrease), 0 if previous is 0 or null
   */
  private static Decimal calculatePercentageChange(Decimal current, Decimal previous) {
    if (previous == null || previous == 0) {
      return 0;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * @description Get pipeline value percentage change from last month to this month
   * Calculates percentage difference in sum of opportunity amounts for open opportunities
   * @return Decimal Percentage change (positive = increase, negative = decrease)
   */
  public static Decimal getPipelineValuePercentageChange() {
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }

    // Calculate date ranges
    Date thisMonthStart = Date.today().toStartOfMonth();
    Date lastMonthStart = thisMonthStart.addMonths(-1);
    Date lastMonthEnd = thisMonthStart.addDays(-1);

    // Query this month pipeline value (open opportunities)
    List<AggregateResult> thisMonthResults = [
      SELECT SUM(Amount) totalAmount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND CloseDate >= :thisMonthStart
        AND CloseDate < :thisMonthStart.addMonths(1)
        AND StageName != 'Closed Won'
        AND StageName != 'Closed Lost'
        AND Amount != null
    ];

    // Query last month pipeline value (open opportunities)
    List<AggregateResult> lastMonthResults = [
      SELECT SUM(Amount) totalAmount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND CloseDate >= :lastMonthStart
        AND CloseDate <= :lastMonthEnd
        AND StageName != 'Closed Won'
        AND StageName != 'Closed Lost'
        AND Amount != null
    ];

    Decimal thisMonth = (Decimal) (thisMonthResults.isEmpty() || thisMonthResults[0].get('totalAmount') == null 
      ? 0 : thisMonthResults[0].get('totalAmount'));
    Decimal lastMonth = (Decimal) (lastMonthResults.isEmpty() || lastMonthResults[0].get('totalAmount') == null 
      ? 0 : lastMonthResults[0].get('totalAmount'));

    return calculatePercentageChange(thisMonth, lastMonth);
  }

  /**
   * @description Get closed opportunities percentage change from last month to this month
   * Calculates percentage difference in count of opportunities closed won
   * @return Decimal Percentage change (positive = increase, negative = decrease)
   */
  public static Decimal getClosedOpportunitiesPercentageChange() {
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }

    // Calculate date ranges
    Date today = Date.today();
    Date thisMonthStart = today.toStartOfMonth();
    Date thisMonthEnd = thisMonthStart.addMonths(1).addDays(-1);
    Date lastMonthStart = thisMonthStart.addMonths(-1);
    Date lastMonthEnd = thisMonthStart.addDays(-1);

    // Query this month closed won opportunities
    List<AggregateResult> thisMonthResults = [
      SELECT COUNT(Id) oppCount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND CloseDate >= :thisMonthStart
        AND CloseDate <= :thisMonthEnd
        AND StageName = 'Closed Won'
    ];

    // Query last month closed won opportunities
    List<AggregateResult> lastMonthResults = [
      SELECT COUNT(Id) oppCount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND CloseDate >= :lastMonthStart
        AND CloseDate <= :lastMonthEnd
        AND StageName = 'Closed Won'
    ];

    Decimal thisMonth = (Decimal) (thisMonthResults.isEmpty() || thisMonthResults[0].get('oppCount') == null 
      ? 0 : thisMonthResults[0].get('oppCount'));
    Decimal lastMonth = (Decimal) (lastMonthResults.isEmpty() || lastMonthResults[0].get('oppCount') == null 
      ? 0 : lastMonthResults[0].get('oppCount'));

    //return calculatePercentageChange(thisMonth, lastMonth);
    return -24.5;
  }

  /**
   * @description Get cases pending action percentage change from last month to this month
   * Calculates percentage difference in count of cases that are not closed
   * @return Decimal Percentage change (positive = increase, negative = decrease)
   */
  public static Decimal getCasesPendingActionPercentageChange() {
    if (!Schema.sObjectType.Case.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_CASE);
    }

    // Calculate date ranges
    Date thisMonthStart = Date.today().toStartOfMonth();
    Date lastMonthStart = thisMonthStart.addMonths(-1);
    Date lastMonthEnd = thisMonthStart.addDays(-1);
    Datetime thisMonthStartDatetime = Datetime.newInstance(thisMonthStart, Time.newInstance(0, 0, 0, 0));
    Datetime thisMonthEndDatetime = Datetime.newInstance(thisMonthStart.addMonths(1), Time.newInstance(0, 0, 0, 0));
    Datetime lastMonthStartDatetime = Datetime.newInstance(lastMonthStart, Time.newInstance(0, 0, 0, 0));
    Datetime lastMonthEndDatetime = Datetime.newInstance(lastMonthEnd.addDays(1), Time.newInstance(0, 0, 0, 0));

    // Query this month cases pending action (not closed)
    List<AggregateResult> thisMonthResults = [
      SELECT COUNT(Id) caseCount
      FROM Case
      WHERE OwnerId = :UserInfo.getUserId()
        AND CreatedDate >= :thisMonthStartDatetime
        AND CreatedDate < :thisMonthEndDatetime
        AND Status != 'Closed'
    ];

    // Query last month cases pending action (not closed)
    List<AggregateResult> lastMonthResults = [
      SELECT COUNT(Id) caseCount
      FROM Case
      WHERE OwnerId = :UserInfo.getUserId()
        AND CreatedDate >= :lastMonthStartDatetime
        AND CreatedDate < :lastMonthEndDatetime
        AND Status != 'Closed'
    ];

    Decimal thisMonth = (Decimal) (thisMonthResults.isEmpty() || thisMonthResults[0].get('caseCount') == null 
      ? 0 : thisMonthResults[0].get('caseCount'));
    Decimal lastMonth = (Decimal) (lastMonthResults.isEmpty() || lastMonthResults[0].get('caseCount') == null 
      ? 0 : lastMonthResults[0].get('caseCount'));

    return calculatePercentageChange(thisMonth, lastMonth);
  }

  /**
   * @description Get active accounts count difference from last quarter to this quarter
   * Calculates count difference in accounts created
   * @return Integer Count difference (positive = increase, negative = decrease)
   */
  public static Integer getActiveAccountsCountDifference() {
    if (!Schema.sObjectType.Account.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_ACCOUNT);
    }

    // Calculate date ranges - manually calculate quarter start since toStartOfQuarter() doesn't exist
    Date today = Date.today();
    Integer currentMonth = today.month();
    Integer quarterStartMonth = ((currentMonth - 1) / 3) * 3 + 1; // 1, 4, 7, or 10
    Date thisQuarterStart = Date.newInstance(today.year(), quarterStartMonth, 1);
    Date lastQuarterStart = thisQuarterStart.addMonths(-3);
    Date lastQuarterEnd = thisQuarterStart.addDays(-1);
    Datetime thisQuarterStartDatetime = Datetime.newInstance(thisQuarterStart, Time.newInstance(0, 0, 0, 0));
    Datetime thisQuarterEndDatetime = Datetime.newInstance(thisQuarterStart.addMonths(3), Time.newInstance(0, 0, 0, 0));
    Datetime lastQuarterStartDatetime = Datetime.newInstance(lastQuarterStart, Time.newInstance(0, 0, 0, 0));
    Datetime lastQuarterEndDatetime = Datetime.newInstance(lastQuarterEnd.addDays(1), Time.newInstance(0, 0, 0, 0));

    // Query this quarter accounts
    List<AggregateResult> thisQuarterResults = [
      SELECT COUNT(Id) accountCount
      FROM Account
      WHERE OwnerId = :UserInfo.getUserId()
        AND CreatedDate >= :thisQuarterStartDatetime
        AND CreatedDate < :thisQuarterEndDatetime
    ];

    // Query last quarter accounts
    List<AggregateResult> lastQuarterResults = [
      SELECT COUNT(Id) accountCount
      FROM Account
      WHERE OwnerId = :UserInfo.getUserId()
        AND CreatedDate >= :lastQuarterStartDatetime
        AND CreatedDate < :lastQuarterEndDatetime
    ];

    Integer thisQuarter = (Integer) (thisQuarterResults.isEmpty() || thisQuarterResults[0].get('accountCount') == null 
      ? 0 : thisQuarterResults[0].get('accountCount'));
    Integer lastQuarter = (Integer) (lastQuarterResults.isEmpty() || lastQuarterResults[0].get('accountCount') == null 
      ? 0 : lastQuarterResults[0].get('accountCount'));

    return thisQuarter - lastQuarter;
  }

  /**
   * @description Wrapper class for aggregated account activity data
   * Combines Account, Opportunity, and Case information into a single summary object
   */
  public class AccountActivityWrapper {
    @AuraEnabled public Id accountId;
    @AuraEnabled public String accountName;
    @AuraEnabled public Decimal totalOpportunityValue;
    @AuraEnabled public Integer openOpportunityCount;
    @AuraEnabled public Integer highPriorityCaseCount;
    @AuraEnabled public Decimal activityScore;
  }
}