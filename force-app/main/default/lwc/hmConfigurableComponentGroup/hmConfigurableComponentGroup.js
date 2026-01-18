import { LightningElement, api, wire } from "lwc";
import getComponentGroupConfiguration from "@salesforce/apex/HM_DashboardConfigService.getComponentGroupConfiguration";

/**
 * @description Component group that renders multiple components in a layout
 * Supports horizontal, vertical, and grid layouts
 */
export default class HM_ConfigurableComponentGroup extends LightningElement {
  // ==================== CONSTANTS ====================
  static COMPONENT_TYPES = {
    TILE: "Tile",
    MINI_TILE: "Mini-Tile",
    LIST: "List"
  };

  static LAYOUT_TYPES = {
    HORIZONTAL: "Horizontal",
    VERTICAL: "Vertical",
    GRID: "Grid"
  };

  static CSS_CLASSES = {
    CONTAINER: "hm-group-container",
    CONTAINER_DARK: "hm-group-container cc-dark",
    LAYOUT_HORIZONTAL: "hm-group-layout-horizontal",
    LAYOUT_VERTICAL: "hm-group-layout-vertical",
    LAYOUT_GRID: "hm-group-layout-grid"
  };

  static DEFAULT_LAYOUT = HM_ConfigurableComponentGroup.LAYOUT_TYPES.HORIZONTAL;

  // ==================== PUBLIC PROPERTIES ====================
  @api componentGroupId;
  @api isDarkMode = false;

  // Group configuration
  groupConfig = null;
  isLoading = true;
  error = null;

  connectedCallback() {
    if (!this.componentGroupId) {
      this.error = {
        message:
          "Component Group ID is required. Please provide a componentGroupId attribute."
      };
      this.isLoading = false;
    }
  }

  // Wire group configuration
  @wire(getComponentGroupConfiguration, { groupId: "$componentGroupId" })
  wiredGroupConfig({ error, data }) {
    if (data) {
      this.groupConfig = data;
      this.error = null;
    } else if (error) {
      this.error = error;
    }
    this.isLoading = false;
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
   * @description Get container class with dark mode support
   */
  get containerClass() {
    return this.isDarkMode
      ? HM_ConfigurableComponentGroup.CSS_CLASSES.CONTAINER_DARK
      : HM_ConfigurableComponentGroup.CSS_CLASSES.CONTAINER;
  }

  /**
   * @description Get layout class based on layout type
   */
  get layoutClass() {
    if (!this.groupConfig) {
      return HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_HORIZONTAL;
    }

    const layoutType = this.groupConfig.layoutType || HM_ConfigurableComponentGroup.DEFAULT_LAYOUT;
    const layoutTypeLower = layoutType.toLowerCase();
    
    // Map layout type to CSS class
    if (layoutTypeLower === HM_ConfigurableComponentGroup.LAYOUT_TYPES.VERTICAL.toLowerCase()) {
      return HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_VERTICAL;
    } else if (layoutTypeLower === HM_ConfigurableComponentGroup.LAYOUT_TYPES.GRID.toLowerCase()) {
      return HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_GRID;
    }
    
    // Default to horizontal
    return HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_HORIZONTAL;
  }

  /**
   * @description Get components from configuration with type flags
   * Filters out components without a valid type
   */
  get components() {
    if (!this.groupConfig || !this.groupConfig.components) {
      return [];
    }

    // Filter out components without a type and map with flags
    const filtered = this.groupConfig.components
      .filter((comp) => {
        const hasType = comp.type && comp.type.trim().length > 0;
        return hasType;
      })
      .map((comp) => ({
        ...comp,
        isTile: comp.type === HM_ConfigurableComponentGroup.COMPONENT_TYPES.TILE || 
                comp.type === HM_ConfigurableComponentGroup.COMPONENT_TYPES.MINI_TILE,
        isList: comp.type === HM_ConfigurableComponentGroup.COMPONENT_TYPES.LIST
      }));

    return filtered;
  }

  /**
   * @description Check if group has components
   * Only returns true if there are components with valid types AND we're not loading
   */
  get hasComponents() {
    // Don't show message while loading
    if (this.isLoading) {
      return true;
    }

    // Don't show message if there's an error
    if (this.error) {
      return true;
    }

    const comps = this.components;
    const hasComps = comps && comps.length > 0;

    return hasComps;
  }

  /**
   * @description Get formatted error message for display
   */
  get errorMessage() {
    return this.extractErrorMessage(this.error);
  }
}