import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getUserName from "@salesforce/apex/HM_DashboardController.getUserName";
import getDashboardConfiguration from "@salesforce/apex/HM_DashboardConfigService.getDashboardConfiguration";

/**
 * @description Top-level configurable dashboard component
 * Orchestrates dashboard groups and components based on custom object configuration
 */
export default class HM_ConfigurableDashboard extends NavigationMixin(
  LightningElement
) {
  // ==================== CONSTANTS ====================
  static CSS_CLASSES = {
    CONTAINER: "cc-container",
    CONTAINER_DARK: "cc-container cc-dark",
    HOST_DARK: "cc-dark",
    MENU_OPEN: "cc-actions-menu cc-actions-menu--open",
    MENU_CLOSED: "cc-actions-menu"
  };

  static ACTION_TYPES = {
    NAVIGATION: "navigation"
  };

  static NAVIGATION_TYPES = {
    OBJECT_PAGE: "standard__objectPage",
    RECORD_PAGE: "standard__recordPage"
  };

  static DEFAULT_VALUES = {
    DARK_MODE_STYLE_ID: "hm-dashboard-dark-mode-styles",
    MENU_ITEM_PREFIX: "action_",
    TOGGLE_DARK_MODE_VALUE: "toggleDarkMode"
  };

  static THEME_LABELS = {
    SWITCH_TO_LIGHT: "Switch to Light Mode",
    SWITCH_TO_DARK: "Switch to Dark Mode"
  };

  static THEME_ICONS = {
    TOGGLE_ON: "utility:toggle_on",
    TOGGLE_OFF: "utility:toggle_off",
    FALLBACK: "utility:preview"
  };

  static DEFAULT_ICONS = {
    ACTION: "utility:add",
    SETTINGS: "utility:settings"
  };

  // ==================== PUBLIC PROPERTIES ====================
  @api dashboardId;
  @api dashboardName;

  // Theme properties
  isDarkMode = false;

  // User info
  userName = "";

  // Dashboard configuration
  dashboardConfig = null;
  isLoading = true;
  error = null;

  // Actions configuration
  actions = [];
  showActionsMenu = true;
  enableDarkMode = true;
  isMenuOpen = false;
  menuObserver = null;
  darkModeStyleId = HM_ConfigurableDashboard.DEFAULT_VALUES.DARK_MODE_STYLE_ID;

  // Wire user name
  @wire(getUserName)
  wiredUserName({ error, data }) {
    if (data) {
      this.userName = data;
    }
  }

  // Wire dashboard configuration
  @wire(getDashboardConfiguration, {
    dashboardIdOrName: "$dashboardIdentifier"
  })
  wiredDashboardConfig({ error, data }) {
    if (data) {
      this.dashboardConfig = data;
      this.error = null;

      // Initialize actions and settings from dashboard config
      if (data.dashboard) {
        this.actions = data.dashboard.actions || [];
        this.showActionsMenu = data.dashboard.showActionsMenu !== false;
        this.enableDarkMode = data.dashboard.enableDarkMode !== false; // Default to true

        // Initialize dark mode from default (only if dark mode is enabled)
        if (this.enableDarkMode && data.dashboard.defaultDarkMode === true) {
          this.isDarkMode = true;
        } else {
          // Force light mode if dark mode is disabled
          this.isDarkMode = false;
        }

        // Propagate dark mode after initialization
        this.propagateDarkMode();
      }
    } else if (error) {
      this.error = error;
    }
    this.isLoading = false;
  }

  /**
   * @description Get dashboard identifier (ID or Name)
   */
  get dashboardIdentifier() {
    return this.dashboardId || this.dashboardName || "";
  }

  /**
   * @description Extract error message from error object
   * Handles different error formats (AuraHandledException, standard errors, strings)
   * @param {Object|String} error - Error object or string
   * @return {String} Extracted error message
   */
  extractErrorMessage(error) {
    if (!error) return "Unknown error";
    if (error.body?.message) return error.body.message;
    if (error.message) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error occurred";
  }

  /**
   * @description Get container CSS class
   */
  get containerClass() {
    return this.isDarkMode 
      ? HM_ConfigurableDashboard.CSS_CLASSES.CONTAINER_DARK 
      : HM_ConfigurableDashboard.CSS_CLASSES.CONTAINER;
  }

  /**
   * @description Get host CSS class for dark mode styling
   */
  get hostClass() {
    return this.isDarkMode 
      ? HM_ConfigurableDashboard.CSS_CLASSES.HOST_DARK 
      : "";
  }

  /**
   * @description Get menu button CSS class
   */
  get menuButtonClass() {
    return this.isMenuOpen
      ? HM_ConfigurableDashboard.CSS_CLASSES.MENU_OPEN
      : HM_ConfigurableDashboard.CSS_CLASSES.MENU_CLOSED;
  }

  /**
   * @description Get menu button variant for dark mode
   */
  get menuButtonVariant() {
    return this.isDarkMode ? "border-inverse" : "border";
  }

  /**
   * @description Get theme toggle label
   */
  get themeToggleLabel() {
    return this.isDarkMode 
      ? HM_ConfigurableDashboard.THEME_LABELS.SWITCH_TO_LIGHT 
      : HM_ConfigurableDashboard.THEME_LABELS.SWITCH_TO_DARK;
  }

  /**
   * @description Get theme toggle icon
   * This is a dedicated getter to ensure reactivity
   * Uses valid Salesforce utility icons:
   * - utility:toggle_on when in dark mode (to switch to light - toggle ON light mode)
   * - utility:toggle_off when in light mode (to switch to dark - toggle OFF light mode)
   * These icons semantically represent the toggle action perfectly
   */
  get themeToggleIcon() {
    // When in dark mode, show toggle_on (to turn on light mode)
    // When in light mode, show toggle_off (to turn off light mode / turn on dark mode)
    return this.isDarkMode 
      ? HM_ConfigurableDashboard.THEME_ICONS.TOGGLE_ON 
      : HM_ConfigurableDashboard.THEME_ICONS.TOGGLE_OFF;
  }

  /**
   * @description Get dashboard groups
   */
  get groups() {
    return this.dashboardConfig?.groups || [];
  }

  /**
   * @description Get all menu items (dark mode toggle + actions)
   */
  get menuItems() {
    const items = [];

    // Dark mode toggle is first (only if dark mode is enabled)
    if (this.enableDarkMode) {
      // Use the dedicated getter to ensure reactivity
      // toggle_on icon when in dark mode (to switch to light), toggle_off icon when in light mode (to switch to dark)
      const darkModeIcon = this.themeToggleIcon;

      const menuItem = {
        label: this.themeToggleLabel,
        value: HM_ConfigurableDashboard.DEFAULT_VALUES.TOGGLE_DARK_MODE_VALUE,
        iconName: darkModeIcon || HM_ConfigurableDashboard.THEME_ICONS.FALLBACK
      };

      items.push(menuItem);
    }

    // Add configured actions
    if (this.actions && this.actions.length > 0) {
      this.actions.forEach((action, index) => {
        items.push({
          label: action.label || "Action",
          value: `${HM_ConfigurableDashboard.DEFAULT_VALUES.MENU_ITEM_PREFIX}${index}`,
          iconName: action.icon || HM_ConfigurableDashboard.DEFAULT_ICONS.ACTION,
          actionData: action
        });
      });
    }

    return items;
  }

  /**
   * @description Get formatted error message for display
   */
  get errorMessage() {
    return this.extractErrorMessage(this.error);
  }

  /**
   * @description Handle menu open
   */
  handleMenuOpen() {
    this.isMenuOpen = true;
    // Mark our menu button so we can identify its dropdown
    const menuButton = this.template.querySelector(
      'lightning-button-menu[data-menu-id="hm-dashboard-actions-menu"]'
    );
    if (menuButton) {
      // Add a class to help identify the dropdown
      setTimeout(() => {
        this.markOurMenuDropdown(menuButton);
      }, 100);
    }
    // Apply dark mode styling to dropdown menu (rendered outside shadow DOM)
    this.styleMenuDropdown();
    // Set up observer to catch menu rendering
    this.observeMenuDropdown();
  }

  /**
   * @description Mark our dropdown menu with a class for easier targeting
   */
  markOurMenuDropdown(menuButton) {
    // Find the dropdown that appeared after our button
    const dropdowns = document.querySelectorAll(".slds-dropdown");
    dropdowns.forEach((dropdown) => {
      // Check if this dropdown contains our toggleDarkMode item
      const hasToggleDarkMode =
        dropdown.querySelector(
          `lightning-menu-item[value="${HM_ConfigurableDashboard.DEFAULT_VALUES.TOGGLE_DARK_MODE_VALUE}"]`
        ) !== null;
      if (hasToggleDarkMode) {
        dropdown.classList.add("hm-dashboard-actions-menu-dropdown");
      }
    });
  }

  /**
   * @description Handle menu close
   */
  handleMenuClose() {
    this.isMenuOpen = false;
    // Clean up observer
    if (this.menuObserver) {
      this.menuObserver.disconnect();
      this.menuObserver = null;
    }
  }

  /**
   * @description Observe DOM for menu dropdown and style it when it appears
   */
  observeMenuDropdown() {
    if (this.menuObserver) {
      this.menuObserver.disconnect();
    }

    this.menuObserver = new MutationObserver(() => {
      this.styleMenuDropdown();
    });

    // Observe body for new elements (menu is rendered there)
    this.menuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * @description Style the dropdown menu for dark mode
   * Only targets our custom menu, not native Salesforce dropdowns
   */
  styleMenuDropdown() {
    if (!this.isDarkMode) {
      return;
    }

    // Try multiple times with increasing delays to catch the menu
    [50, 100, 200, 300].forEach((delay) => {
      setTimeout(() => {
        const menuButton = this.template.querySelector(
          'lightning-button-menu[data-menu-id="hm-dashboard-actions-menu"]'
        );
        if (menuButton) {
          this.applyMenuDropdownStyles(menuButton);
        }
      }, delay);
    });
  }

  /**
   * @description Apply dark mode styles to the menu dropdown
   * @param {HTMLElement} menuButton - The menu button element
   */
  applyMenuDropdownStyles(menuButton) {
    // Find dropdown menus - but only ones that belong to our menu
    // Check if dropdown contains our toggleDarkMode menu item
    const dropdowns = document.querySelectorAll(
      '.slds-dropdown, [role="menu"]'
    );
    dropdowns.forEach((dropdown) => {
      // Only style if this dropdown contains our specific menu items
      const hasToggleDarkMode =
        dropdown.querySelector(
          'lightning-menu-item[value="toggleDarkMode"]'
        ) !== null;

      // Only style our custom menu, not native Salesforce dropdowns
      if (hasToggleDarkMode) {
        // Mark this dropdown as ours
        dropdown.classList.add("hm-dashboard-actions-menu-dropdown");
        // Apply dark mode styles to dropdown container only
        // Note: Menu items are in Shadow DOM and can't be styled from outside
        dropdown.style.setProperty(
          "background-color",
          "#1e1e1e",
          "important"
        );
        dropdown.style.setProperty("border-color", "#333", "important");
      }
    });
  }

  /**
   * @description Handle menu item selection
   */
  handleMenuSelect(event) {
    const selectedValue = event.detail.value;

    if (selectedValue === HM_ConfigurableDashboard.DEFAULT_VALUES.TOGGLE_DARK_MODE_VALUE) {
      this.handleThemeToggle();
    } else if (selectedValue && selectedValue.startsWith(HM_ConfigurableDashboard.DEFAULT_VALUES.MENU_ITEM_PREFIX)) {
      const index = parseInt(selectedValue.replace(HM_ConfigurableDashboard.DEFAULT_VALUES.MENU_ITEM_PREFIX, ""), 10);
      if (this.actions && this.actions[index]) {
        this.handleActionClick(this.actions[index]);
      }
    }
  }

  /**
   * @description Handle theme toggle
   */
  handleThemeToggle() {
    // Only allow toggle if dark mode is enabled
    if (!this.enableDarkMode) {
      return;
    }

    this.isDarkMode = !this.isDarkMode;
    // Propagate dark mode to child components
    this.propagateDarkMode();
    // Re-style menu if it's open
    if (this.isMenuOpen) {
      this.styleMenuDropdown();
    }
  }

  /**
   * @description Handle action click
   */
  handleActionClick(action) {
    if (!action || !action.type) {
      return;
    }

    if (action.type === HM_ConfigurableDashboard.ACTION_TYPES.NAVIGATION && action.target) {
      const target = action.target;

      if (target.objectApiName && target.actionName) {
        // Navigate to object page
        this[NavigationMixin.Navigate]({
          type: HM_ConfigurableDashboard.NAVIGATION_TYPES.OBJECT_PAGE,
          attributes: {
            objectApiName: target.objectApiName,
            actionName: target.actionName
          }
        });
      } else if (target.recordId) {
        // Navigate to record page
        this[NavigationMixin.Navigate]({
          type: HM_ConfigurableDashboard.NAVIGATION_TYPES.RECORD_PAGE,
          attributes: {
            recordId: target.recordId,
            actionName: target.actionName || "view"
          }
        });
      }
    }
  }

  /**
   * @description Propagate dark mode state to child components
   * Uses renderedCallback to ensure components are rendered before propagation
   */
  propagateDarkMode() {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      const groupComponents = this.template.querySelectorAll(
        "c-hm-configurable-component-group"
      );
      groupComponents.forEach((comp) => {
        if (comp) {
          comp.isDarkMode = this.isDarkMode;
        }
      });

      // Also propagate to tiles and lists directly
      const tileComponents = this.template.querySelectorAll(
        "c-hm-configurable-tile"
      );
      tileComponents.forEach((comp) => {
        if (comp) {
          comp.isDarkMode = this.isDarkMode;
        }
      });

      const listComponents = this.template.querySelectorAll(
        "c-hm-configurable-list"
      );
      listComponents.forEach((comp) => {
        if (comp) {
          comp.isDarkMode = this.isDarkMode;
        }
      });
    }, 0);
  }

  /**
   * @description Lifecycle hook - propagate dark mode after render
   */
  renderedCallback() {
    // Apply dark mode class to host element for CSS styling
    if (this.isDarkMode) {
      this.template.host.classList.add("cc-dark");
      this.injectDarkModeStyles();
    } else {
      this.template.host.classList.remove("cc-dark");
      this.removeDarkModeStyles();
    }

    // Ensure dark mode is propagated after components render
    if (this.dashboardConfig && !this.isLoading) {
      this.propagateDarkMode();
    }
  }

  /**
   * @description Inject global styles for dark mode menu dropdown
   * Note: Due to Shadow DOM limitations, we can only style the dropdown container,
   * not the individual menu items. Menu items will use Salesforce's default styling.
   */
  injectDarkModeStyles() {
    // Remove existing styles if any
    this.removeDarkModeStyles();

    // Create style element - minimal styling due to Shadow DOM limitations
    const style = document.createElement("style");
    style.id = this.darkModeStyleId;
    style.textContent = `
            /* Only style the dropdown container - menu items use Salesforce defaults */
            .hm-dashboard-actions-menu-dropdown {
                background-color: #1e1e1e !important;
                border-color: #333 !important;
            }
            
            /* Fallback for :has() selector support */
            .slds-dropdown:has(lightning-menu-item[value="toggleDarkMode"]) {
                background-color: #1e1e1e !important;
                border-color: #333 !important;
            }
        `;
    document.head.appendChild(style);
  }

  /**
   * @description Remove global dark mode styles
   */
  removeDarkModeStyles() {
    if (this.darkModeStyleId) {
      const existingStyle = document.getElementById(this.darkModeStyleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    }
  }

  /**
   * @description Cleanup on disconnect
   */
  disconnectedCallback() {
    if (this.menuObserver) {
      this.menuObserver.disconnect();
      this.menuObserver = null;
    }
    this.removeDarkModeStyles();
  }
}