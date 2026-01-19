/**
 * @description Test data provider for dashboard components
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
   * @description Get pipeline value percentage change (current month vs previous month)
   * @return Decimal Percentage change, 0 if null or no records
   */
  public static Decimal getPipelineValuePercentageChange() {
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }

    Date currentMonthStart = Date.today().toStartOfMonth();
    Date previousMonthStart = currentMonthStart.addMonths(-1);
    Date previousMonthEnd = currentMonthStart.addDays(-1);

    // Current month pipeline value
    List<AggregateResult> currentResults = [
      SELECT SUM(Amount) totalAmount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND StageName != 'Closed Won'
        AND StageName != 'Closed Lost'
        AND CloseDate >= :currentMonthStart
    ];

    // Previous month pipeline value
    List<AggregateResult> previousResults = [
      SELECT SUM(Amount) totalAmount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND StageName != 'Closed Won'
        AND StageName != 'Closed Lost'
        AND CloseDate >= :previousMonthStart
        AND CloseDate <= :previousMonthEnd
    ];

    Decimal currentValue = currentResults.isEmpty() || currentResults[0].get('totalAmount') == null 
      ? 0 : (Decimal) currentResults[0].get('totalAmount');
    Decimal previousValue = previousResults.isEmpty() || previousResults[0].get('totalAmount') == null 
      ? 0 : (Decimal) previousResults[0].get('totalAmount');

    if (previousValue == 0) {
      return currentValue > 0 ? 100 : 0;
    }

    return ((currentValue - previousValue) / previousValue) * 100;
  }

  /**
   * @description Get closed opportunities percentage change (current month vs previous month)
   * @return Decimal Percentage change, 0 if null or no records
   */
  public static Decimal getClosedOpportunitiesPercentageChange() {
    if (!Schema.sObjectType.Opportunity.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY);
    }

    Date currentMonthStart = Date.today().toStartOfMonth();
    Date previousMonthStart = currentMonthStart.addMonths(-1);
    Date previousMonthEnd = currentMonthStart.addDays(-1);

    // Current month closed opportunities count
    List<AggregateResult> currentResults = [
      SELECT COUNT(Id) totalCount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND (StageName = 'Closed Won' OR StageName = 'Closed Lost')
        AND CloseDate >= :currentMonthStart
    ];

    // Previous month closed opportunities count
    List<AggregateResult> previousResults = [
      SELECT COUNT(Id) totalCount
      FROM Opportunity
      WHERE OwnerId = :UserInfo.getUserId()
        AND (StageName = 'Closed Won' OR StageName = 'Closed Lost')
        AND CloseDate >= :previousMonthStart
        AND CloseDate <= :previousMonthEnd
    ];

    Decimal currentCount = currentResults.isEmpty() || currentResults[0].get('totalCount') == null 
      ? 0 : (Decimal) currentResults[0].get('totalCount');
    Decimal previousCount = previousResults.isEmpty() || previousResults[0].get('totalCount') == null 
      ? 0 : (Decimal) previousResults[0].get('totalCount');

    if (previousCount == 0) {
      return currentCount > 0 ? 100 : 0;
    }

    return ((currentCount - previousCount) / previousCount) * 100;
  }

  /**
   * @description Get cases pending action percentage change (current month vs previous month)
   * @return Decimal Percentage change, 0 if null or no records
   */
  public static Decimal getCasesPendingActionPercentageChange() {
    if (!Schema.sObjectType.Case.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_CASE);
    }

    Date currentMonthStart = Date.today().toStartOfMonth();
    Date previousMonthStart = currentMonthStart.addMonths(-1);
    Date previousMonthEnd = currentMonthStart.addDays(-1);

    // Current month cases pending action count
    List<AggregateResult> currentResults = [
      SELECT COUNT(Id) totalCount
      FROM Case
      WHERE OwnerId = :UserInfo.getUserId()
        AND Status != 'Closed'
        AND CreatedDate >= :currentMonthStart
    ];

    // Previous month cases pending action count
    List<AggregateResult> previousResults = [
      SELECT COUNT(Id) totalCount
      FROM Case
      WHERE OwnerId = :UserInfo.getUserId()
        AND Status != 'Closed'
        AND CreatedDate >= :previousMonthStart
        AND CreatedDate <= :previousMonthEnd
    ];

    Decimal currentCount = currentResults.isEmpty() || currentResults[0].get('totalCount') == null 
      ? 0 : (Decimal) currentResults[0].get('totalCount');
    Decimal previousCount = previousResults.isEmpty() || previousResults[0].get('totalCount') == null 
      ? 0 : (Decimal) previousResults[0].get('totalCount');

    if (previousCount == 0) {
      return currentCount > 0 ? 100 : 0;
    }

    return ((currentCount - previousCount) / previousCount) * 100;
  }

  /**
   * @description Get active accounts count difference (current month vs previous month)
   * @return Decimal Count difference, 0 if null or no records
   */
  public static Decimal getActiveAccountsCountDifference() {
    if (!Schema.sObjectType.Account.isAccessible()) {
      throw new AuraHandledException(ERROR_INSUFFICIENT_PERMISSIONS_ACCOUNT);
    }

    Date currentMonthStart = Date.today().toStartOfMonth();
    Date previousMonthStart = currentMonthStart.addMonths(-1);
    Date previousMonthEnd = currentMonthStart.addDays(-1);

    // Current month active accounts count
    List<AggregateResult> currentResults = [
      SELECT COUNT(Id) totalCount
      FROM Account
      WHERE LastActivityDate >= :currentMonthStart
        OR CreatedDate >= :currentMonthStart
    ];

    // Previous month active accounts count
    List<AggregateResult> previousResults = [
      SELECT COUNT(Id) totalCount
      FROM Account
      WHERE (LastActivityDate >= :previousMonthStart AND LastActivityDate <= :previousMonthEnd)
        OR (CreatedDate >= :previousMonthStart AND CreatedDate <= :previousMonthEnd)
    ];

    Decimal currentCount = currentResults.isEmpty() || currentResults[0].get('totalCount') == null 
      ? 0 : (Decimal) currentResults[0].get('totalCount');
    Decimal previousCount = previousResults.isEmpty() || previousResults[0].get('totalCount') == null 
      ? 0 : (Decimal) previousResults[0].get('totalCount');

    return currentCount - previousCount;
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