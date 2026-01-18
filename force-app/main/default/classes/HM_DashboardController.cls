/**
 * @description Controller for the High Meadows Configurable Dashboard System
 * Provides utility methods for dashboard components
 * 
 * NOTE: This class was originally used for testing/example data methods.
 * Most data is now configured via Data Sources in the UI.
 * Only getUserName() is currently used directly by components.
 * 
 * @author High Meadows
 * @date 2024
 */
public with sharing class HM_DashboardController implements Callable {
  /**
   * @description Call method via Callable interface
   * NOTE: This allows methods to be called via Data Sources configured in the UI
   * @param action Method name to call
   * @param args Map of parameters
   * @return Object Result from the method call
   */
  public Object call(String action, Map<String, Object> args) {
    switch on action {
      when 'getUserName' {
        return getUserName();
      }
      // COMMENTED OUT FOR TESTING - Only getUserName is active
      /*
      when 'getTopAccounts' {
        Integer recordLimit = args != null && args.containsKey('recordLimit') 
          ? (Integer) args.get('recordLimit') 
          : null;
        return getTopAccounts(recordLimit);
      }
      when 'getTodayProgress' {
        return getTodayProgress();
      }
      when 'getKpiMetrics' {
        // Alias for getTodayProgress - returns progress metrics
        return getTodayProgress();
      }
      */
      when else {
        throw new AuraHandledException('Method not found in HM_DashboardController: ' + action);
      }
    }
  }

  // ==================== USER INFO ====================

  /**
   * @description Get current user's first name
   * Used directly by dashboard component via @wire
   * @return String First name of current user
   */
  @AuraEnabled(cacheable=true)
  public static String getUserName() {
    return UserInfo.getFirstName();
  }

  // ==================== COMMENTED OUT FOR TESTING ====================
  // Only getUserName() is active. All other methods commented out for testing.
  
  /*
  // ==================== LEGACY METHODS ====================
  // NOTE: These methods were used for testing/example data.
  // Commented out for testing - only getUserName is active.

  // ==================== CONSTANTS ====================
  private static final Integer HEALTH_SCORE_BASE = 50;
  private static final Integer HEALTH_SCORE_MAX = 100;
  
  private static final Decimal HEALTH_SCORE_THRESHOLD_HIGH = 500000;
  private static final Decimal HEALTH_SCORE_THRESHOLD_MEDIUM = 100000;
  private static final Decimal HEALTH_SCORE_THRESHOLD_LOW = 50000;
  
  private static final Integer HEALTH_SCORE_BONUS_HIGH = 30;
  private static final Integer HEALTH_SCORE_BONUS_MEDIUM = 20;
  private static final Integer HEALTH_SCORE_BONUS_LOW = 10;
  
  private static final Integer HEALTH_SCORE_COUNT_THRESHOLD_HIGH = 3;
  private static final Integer HEALTH_SCORE_COUNT_THRESHOLD_MEDIUM = 2;
  
  private static final Integer HEALTH_SCORE_COUNT_BONUS_HIGH = 20;
  private static final Integer HEALTH_SCORE_COUNT_BONUS_MEDIUM = 10;
  
  private static final Integer HEALTH_SCORE_MINIMUM = 70;
  
  private static final Integer DEFAULT_CALLS_TARGET = 12;
  private static final Integer DEFAULT_EMAILS_TARGET = 20;
  
  private static final String TASK_SUBTYPE_CALL = 'Call';
  private static final String TASK_SUBTYPE_EMAIL = 'Email';
  
  private static final String TREND_DIRECTION_UP = 'up';
  private static final String TREND_DIRECTION_DOWN = 'down';
  
  private static final Integer DEFAULT_TOP_ACCOUNTS_LIMIT = 4;
  
  // ==================== ERROR MESSAGES ====================
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_OPPORTUNITY = 'Insufficient permissions to access Opportunity';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_ACCOUNT = 'Insufficient permissions to access Account';
  private static final String ERROR_INSUFFICIENT_PERMISSIONS_TASK = 'Insufficient permissions to access Task';
  private static final String ERROR_RETRIEVING_TOP_ACCOUNTS = 'Error retrieving top accounts: {0}';
  private static final String ERROR_RETRIEVING_TODAY_PROGRESS = 'Error retrieving today\'s progress: {0}';

  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> getTopAccounts(Integer recordLimit) {
    throw new AuraHandledException('getTopAccounts is deprecated. Use Data Sources configured in UI instead.');
  }

  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getTodayProgress() {
    throw new AuraHandledException('getTodayProgress is deprecated. Use Data Sources configured in UI instead.');
  }

  public static List<String> validateFilterOptions(
    String filterFieldApi,
    String filterOptions
  ) {
    List<String> errors = new List<String>();

    if (String.isBlank(filterOptions)) {
      return errors;
    }

    try {
      List<String> pairs = filterOptions.split(',');

      for (String pair : pairs) {
        String trimmed = pair.trim();
        if (String.isBlank(trimmed)) {
          continue;
        }

        if (trimmed.indexOf(':') < 0) {
          if (trimmed.length() == 0) {
            errors.add('Empty filter option found');
          }
        } else {
          List<String> parts = trimmed.split(':', 2);
          if (parts.size() != 2) {
            errors.add(
              'Invalid filter option format: "' +
                trimmed +
                '" (expected: value:label)'
            );
          } else {
            String value = parts[0].trim();
            String label = parts[1].trim();
            if (String.isBlank(value)) {
              errors.add('Filter option has empty value: "' + trimmed + '"');
            }
            if (String.isBlank(label)) {
              errors.add('Filter option has empty label: "' + trimmed + '"');
            }
          }
        }
      }

      if (String.isNotBlank(filterFieldApi)) {
        // Validation logic
      }
    } catch (Exception ex) {
      errors.add('Validation error: ' + ex.getMessage());
    }

    return errors;
  }
  */
}