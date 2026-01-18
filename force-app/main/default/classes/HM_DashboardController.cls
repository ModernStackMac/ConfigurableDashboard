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
}