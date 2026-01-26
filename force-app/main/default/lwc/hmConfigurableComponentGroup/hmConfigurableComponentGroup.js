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

  // Container size tracking
  containerSize = 'lg'; // Default to large for backward compatibility
  resizeObserver = null;
  resizeDebounceTimeout = null;

  /**
   * @description Lifecycle hook called when component is inserted into DOM
   * Validates componentGroupId is provided and sets up ResizeObserver
   */
  connectedCallback() {
    if (!this.componentGroupId) {
      this.error = {
        message:
          "Component Group ID is required. Please provide a componentGroupId attribute."
      };
      this.isLoading = false;
    }
    // Set up ResizeObserver after component is rendered
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.setupResizeObserver();
    }, 0);
  }

  /**
   * @description Set up ResizeObserver to track container width
   * Measures the container element and updates containerSize based on breakpoints
   */
  setupResizeObserver() {
    const container = this.template.querySelector('.hm-group-container');
    if (!container) {
      return;
    }

    // Initial measurement
    this.updateContainerSize(container);

    // Set up observer with debouncing
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.resizeDebounceTimeout) {
        clearTimeout(this.resizeDebounceTimeout);
      }
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.resizeDebounceTimeout = setTimeout(() => {
        if (entries && entries.length > 0) {
          this.updateContainerSize(entries[0].target);
        }
      }, 150);
    });

    this.resizeObserver.observe(container);
  }

  /**
   * @description Update containerSize based on container width
   * Breakpoints: xs < 480px, sm 480-768px, md 768-1024px, lg >= 1024px
   * @param {HTMLElement} container - Container element to measure
   */
  updateContainerSize(container) {
    if (!container) {
      return;
    }

    const width = container.offsetWidth || container.clientWidth;
    let newSize = 'lg';

    if (width < 480) {
      newSize = 'xs';
    } else if (width < 768) {
      newSize = 'sm';
    } else if (width < 1024) {
      newSize = 'md';
    } else {
      newSize = 'lg';
    }

    if (this.containerSize !== newSize) {
      this.containerSize = newSize;
    }
  }

  /**
   * @description Wire group configuration from Apex
   * Automatically loads configuration when componentGroupId changes
   */
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
   * @description Get container class with dark mode support
   * @return {String} CSS class string for container
   */
  get containerClass() {
    return this.isDarkMode
      ? HM_ConfigurableComponentGroup.CSS_CLASSES.CONTAINER_DARK
      : HM_ConfigurableComponentGroup.CSS_CLASSES.CONTAINER;
  }

  /**
   * @description Get components per row value from configuration
   * @return {Number|null} Number of components per row, or null if not set
   */
  get componentsPerRow() {
    if (!this.groupConfig || this.groupConfig.componentsPerRow == null) {
      return null;
    }
    return this.groupConfig.componentsPerRow;
  }

  /**
   * @description Get layout class based on layout type and container size
   * Maps layout type (Horizontal, Vertical, Grid) to corresponding CSS class
   * Adds SLDS2 responsive grid classes based on containerSize
   * @return {String} CSS class string for layout
   */
  get layoutClass() {
    if (!this.groupConfig) {
      return this.getResponsiveLayoutClass(HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_HORIZONTAL);
    }

    const layoutType = this.groupConfig.layoutType || HM_ConfigurableComponentGroup.DEFAULT_LAYOUT;
    const layoutTypeLower = layoutType.toLowerCase();
    
    let baseClass;
    // Map layout type to CSS class
    if (layoutTypeLower === HM_ConfigurableComponentGroup.LAYOUT_TYPES.VERTICAL.toLowerCase()) {
      baseClass = HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_VERTICAL;
    } else if (layoutTypeLower === HM_ConfigurableComponentGroup.LAYOUT_TYPES.GRID.toLowerCase()) {
      baseClass = HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_GRID;
    } else {
      // Default to horizontal
      baseClass = HM_ConfigurableComponentGroup.CSS_CLASSES.LAYOUT_HORIZONTAL;
    }
    
    return this.getResponsiveLayoutClass(baseClass);
  }

  /**
   * @description Get responsive layout class with SLDS2 utilities
   * Returns base layout class - CSS Grid is handled by CSS file
   * @param {String} baseClass - Base layout class (horizontal, vertical, or grid)
   * @return {String} CSS class string
   */
  getResponsiveLayoutClass(baseClass) {
    // Return base class - CSS Grid is handled by CSS file via display: grid
    return baseClass;
  }

  /**
   * @description Get responsive item class based on containerSize
   * Returns empty string - sizing is handled by CSS Grid, not SLDS2 size classes
   * SLDS2 size classes conflict with CSS Grid, so we rely on grid-template-columns
   * @return {String} Empty string (sizing handled by CSS)
   */
  get itemClass() {
    // Return empty - CSS Grid handles sizing via grid-template-columns
    return '';
  }


  /**
   * @description Get number of columns for grid layout based on containerSize
   * Used to compute grid-template-columns dynamically
   * @return {Number} Number of columns for the grid
   */
  get gridColumns() {
    const componentsPerRow = this.componentsPerRow || 4; // Default to 4 if not set
    
    if (this.containerSize === 'xs' || this.containerSize === 'sm') {
      // Force single column on extra small and small containers
      return 1;
    }
    if (this.containerSize === 'md') {
      // Limit to 2 columns max on medium containers
      return 2;
    }
    // Large containers: use configured componentsPerRow
    if (componentsPerRow === 1) {
      return 1;
    }
    if (componentsPerRow === 2) {
      return 2;
    }
    if (componentsPerRow === 3) {
      return 3;
    }
    if (componentsPerRow === 4) {
      return 4;
    }
    // Default to 4 for 4+ components per row
    return 4;
  }

  /**
   * @description Get dynamic style string for layout based on container size
   * Uses CSS Grid with responsive column count based on containerSize
   * @return {String} CSS style string with grid-template-columns
   */
  get layoutStyle() {
    const columns = this.gridColumns;
    // Use CSS Grid with equal-sized columns (1fr each)
    // This ensures all cards are the same size
    return `grid-template-columns: repeat(${columns}, minmax(0, 1fr));`;
  }

  /**
   * @description Get components from configuration with type flags
   * Filters out components without a valid type and adds isTile/isList flags
   * Also adds itemClass for grid layout (lists span full width)
   * @return {Array} Array of component objects with type flags and itemClass
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
      .map((comp) => {
        const isTile = comp.type === HM_ConfigurableComponentGroup.COMPONENT_TYPES.TILE;
        const isList = comp.type === HM_ConfigurableComponentGroup.COMPONENT_TYPES.LIST;
        // Lists span full width across all grid columns
        const itemClass = isList ? 'hm-group-item hm-group-item--full-width' : 'hm-group-item';
        return {
          ...comp,
          isTile,
          isList,
          itemClass
        };
      });

    return filtered;
  }

  /**
   * @description Check if group has components to display
   * Returns true during loading or if error exists to prevent empty state message
   * @return {Boolean} True if has components, loading, or error
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
   * @description Extract error message from error object
   * Handles different error formats (AuraHandledException, standard errors, strings)
   * @param {Object|String} error - Error object or string
   * @return {String} Extracted error message
   */
  extractErrorMessage(error) {
    if (!error) {
      return "Unknown error";
    }
    if (error.body?.message) {
      return error.body.message;
    }
    if (error.message) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error occurred";
  }

  /**
   * @description Get formatted error message for display
   * @return {String} Extracted error message
   */
  get errorMessage() {
    return this.extractErrorMessage(this.error);
  }

  /**
   * @description Lifecycle hook called when component is removed from DOM
   * Cleans up ResizeObserver and debounce timeout
   */
  disconnectedCallback() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeDebounceTimeout) {
      clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }
  }
}