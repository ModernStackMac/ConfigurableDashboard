import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getComponentConfiguration from "@salesforce/apex/HM_DashboardConfigService.getComponentConfiguration";
import executeComponentQuery from "@salesforce/apex/HM_ComponentDataService.executeComponentQuery";

/**
 * @description Configurable tile component for displaying KPI metrics
 * Accepts componentId and retrieves configuration and data dynamically
 */
export default class HM_ConfigurableTile extends NavigationMixin(
  LightningElement
) {
  // ==================== CONSTANTS ====================
  static MAP_TYPES = {
    TILE_VALUE: "Tile Value",
    TILE_CHANGE: "Tile Change",
    TILE_SUBTITLE: "Tile Subtitle",
    TILE_BADGE: "Tile Badge",
    TILE_ICON: "Tile Icon"
  };

  static DEFAULT_ICON = "utility:info";
  static DEFAULT_VALUE = "0";

  static CSS_CLASSES = {
    CHANGE_UP: "cc-kpi-change cc-kpi-change--up",
    CHANGE_DOWN: "cc-kpi-change cc-kpi-change--down",
    ICON_BRAND: "cc-kpi-icon cc-kpi-icon--brand",
    ICON_ALERT: "cc-kpi-icon cc-kpi-icon--alert",
    BADGE_UP: "cc-kpi-badge cc-kpi-badge--up"
  };

  static TREND_ICONS = {
    UP: "utility:arrowup",
    DOWN: "utility:arrowdown"
  };

  // ==================== PUBLIC PROPERTIES ====================
  @api componentId;
  @api isDarkMode = false;

  // Component configuration
  componentConfig = null;
  isLoading = true;
  error = null;

  // Tile data
  tileData = {
    value: "",
    change: "",
    subtitle: "",
    badge: null,
    changeClass: "",
    trendIcon: "",
    iconName: "",
    iconClass: ""
  };

  connectedCallback() {
    if (!this.componentId) {
      this.error = {
        message:
          "Component ID is required. Please provide a componentId attribute."
      };
      this.isLoading = false;
    }
  }

  // Wire component configuration
  @wire(getComponentConfiguration, { componentId: "$componentId" })
  wiredComponentConfig({ error, data }) {
    if (data) {
      this.componentConfig = data;
      this.error = null;
      this.loadTileData();
    } else if (error) {
      this.error = error;
      this.isLoading = false;
      // Error message will be displayed via errorMessage getter
    }
  }

  /**
   * @description Load tile data based on configuration
   */
  async loadTileData() {
    if (!this.componentConfig) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      // Execute component query to get data
      const response = await executeComponentQuery({
        componentId: this.componentId,
        context: {}
      });

      if (response && response.success) {
        if (response.shape === 'AGGREGATE') {
          // Use aggregate value directly
          this.processAggregateData(response.aggregateValue, response.aggregateType);
        } else if (response.shape === 'LIST' && response.rows && response.rows.length > 0) {
          // Fallback: use first row (backward compatibility)
          this.processTileData(response.rows[0]);
        } else {
          // Set default/empty values
          this.tileData = this.getDefaultTileData();
        }
      } else {
        // Set default/empty values
        this.tileData = this.getDefaultTileData();
      }
    } catch (err) {
      this.error = err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * @description Get default tile data structure
   * @return {Object} Default tile data object
   */
  getDefaultTileData() {
    return {
      value: HM_ConfigurableTile.DEFAULT_VALUE,
      change: "",
      subtitle: "",
      badge: null,
      changeClass: HM_ConfigurableTile.CSS_CLASSES.CHANGE_UP,
      trendIcon: HM_ConfigurableTile.TREND_ICONS.UP,
      iconName: this.componentConfig?.iconName || HM_ConfigurableTile.DEFAULT_ICON,
      iconClass: HM_ConfigurableTile.CSS_CLASSES.ICON_BRAND
    };
  }

  /**
   * @description Build index map of detail maps by map type for O(1) lookups
   * @param {Array} detailMaps - Array of detail map objects
   * @return {Map} Map with mapType as key and detailMap as value
   */
  buildDetailMapIndex(detailMaps) {
    const mapIndex = new Map();
    if (!detailMaps || detailMaps.length === 0) {
      return mapIndex;
    }

    for (const map of detailMaps) {
      if (map.mapType) {
        // Only store the first occurrence of each map type
        if (!mapIndex.has(map.mapType)) {
          mapIndex.set(map.mapType, map);
        }
      }
    }

    return mapIndex;
  }

  /**
   * @description Process aggregate value into tile display format
   * @param {Object} aggregateValue - The aggregate value (Decimal, Integer, String, Boolean, Date, Datetime)
   * @param {String} aggregateType - Type of aggregate (DECIMAL, INTEGER, STRING, BOOLEAN, DATE, DATETIME)
   */
  processAggregateData(aggregateValue, aggregateType) {
    const detailMaps = this.componentConfig.detailMaps || [];
    const mapIndex = this.buildDetailMapIndex(detailMaps);
    
    // Format the aggregate value based on type
    let formattedValue = this.formatAggregateValue(aggregateValue, aggregateType);
    
    // Extract other tile properties from detail maps if available
    const changeData = this.extractTileChange(mapIndex, { value: aggregateValue });
    const subtitle = this.extractTileSubtitle(mapIndex, { value: aggregateValue });
    const badgeData = this.extractTileBadge(mapIndex, { value: aggregateValue });
    const iconName =
      this.extractTileIcon(mapIndex, { value: aggregateValue }) ||
      this.componentConfig.iconName ||
      HM_ConfigurableTile.DEFAULT_ICON;

    // Determine icon class based on icon name or default
    const iconClass = this.getIconClass(iconName);

    // Set tile data
    this.tileData = {
      value: formattedValue || HM_ConfigurableTile.DEFAULT_VALUE,
      change: changeData.change || "",
      subtitle: subtitle || "",
      badge: badgeData.badge,
      changeClass: changeData.changeClass,
      trendIcon: changeData.trendIcon,
      iconName: iconName,
      iconClass: iconClass
    };
  }

  /**
   * @description Format aggregate value based on type
   * @param {Object} value - Aggregate value
   * @param {String} type - Aggregate type (DECIMAL, INTEGER, STRING, BOOLEAN, DATE, DATETIME)
   * @return {String} Formatted value string
   */
  formatAggregateValue(value, type) {
    if (value === null || value === undefined) {
      return "0";
    }

    switch (type) {
      case 'DECIMAL':
      case 'INTEGER':
        return this.formatNumber(value);
      case 'STRING':
        return String(value);
      case 'BOOLEAN':
        return value ? 'Yes' : 'No';
      case 'DATE':
        return this.formatDate(value);
      case 'DATETIME':
        return this.formatDateTime(value);
      default:
        return String(value);
    }
  }

  /**
   * @description Process raw data into tile display format
   * Extracts value, change, subtitle, badge, and icon from detail maps
   * @param {Object} data - Data object containing field values
   */
  processTileData(data) {
    const detailMaps = this.componentConfig.detailMaps || [];
    const mapIndex = this.buildDetailMapIndex(detailMaps);

    // Extract values from detail maps using indexed lookup
    const value = this.extractTileValue(mapIndex, data);
    const changeData = this.extractTileChange(mapIndex, data);
    const subtitle = this.extractTileSubtitle(mapIndex, data);
    const badgeData = this.extractTileBadge(mapIndex, data);
    const iconName =
      this.extractTileIcon(mapIndex, data) ||
      this.componentConfig.iconName ||
      HM_ConfigurableTile.DEFAULT_ICON;

    // Determine icon class based on icon name or default
    const iconClass = this.getIconClass(iconName);

    // Set initial tile data
    this.tileData = {
      value: value || HM_ConfigurableTile.DEFAULT_VALUE,
      change: changeData.change || "",
      subtitle: subtitle || "",
      badge: badgeData.badge,
      changeClass: changeData.changeClass,
      trendIcon: changeData.trendIcon,
      iconName: iconName,
      iconClass: iconClass
    };
  }

  /**
   * @description Extract tile value from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @return {String} Formatted tile value
   */
  extractTileValue(mapIndex, data) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_VALUE);
    if (!map) {
      return "";
    }

    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    return this.formatValue(fieldValue, map.formatType);
  }

  /**
   * @description Determine trend direction (up/down) based on numeric value
   * @param {Number} value - Numeric value to evaluate
   * @return {Object} Object with changeClass and trendIcon properties
   */
  determineTrendDirection(value) {
    const numValue = this.parseNumber(value);

    if (numValue < 0) {
      return {
        changeClass: HM_ConfigurableTile.CSS_CLASSES.CHANGE_DOWN,
        trendIcon: HM_ConfigurableTile.TREND_ICONS.DOWN
      };
    }

    // Default to up for zero or positive values
    return {
      changeClass: HM_ConfigurableTile.CSS_CLASSES.CHANGE_UP,
      trendIcon: HM_ConfigurableTile.TREND_ICONS.UP
    };
  }

  /**
   * @description Extract tile change from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @return {Object} Object with change, changeClass, and trendIcon properties
   */
  extractTileChange(mapIndex, data) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_CHANGE);
    if (!map) {
      return {
        change: "",
        changeClass: HM_ConfigurableTile.CSS_CLASSES.CHANGE_UP,
        trendIcon: HM_ConfigurableTile.TREND_ICONS.UP
      };
    }

    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    const change = this.formatChange(fieldValue, map.formatType);
    const trendDirection = this.determineTrendDirection(fieldValue);

    return {
      change,
      changeClass: trendDirection.changeClass,
      trendIcon: trendDirection.trendIcon
    };
  }

  /**
   * @description Extract tile subtitle from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @return {String} Tile subtitle text
   */
  extractTileSubtitle(mapIndex, data) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_SUBTITLE);
    if (!map) {
      return "";
    }

    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    const subtitle = String(fieldValue || "");
    // Check for formatted subtitle fields (pipelineSubtitle, closedWonSubtitle, etc.)
    const formattedSubtitle = this.getFormattedSubtitle(data);
    return formattedSubtitle || subtitle;
  }

  /**
   * @description Extract tile badge from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @return {Object} Badge object with text, class, and icon, or null
   */
  extractTileBadge(mapIndex, data) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_BADGE);
    if (!map) {
      return { badge: null };
    }

    // Use value from data (date range calculation removed)
    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    // Note: badgeType field removed, badges will use field value directly
    if (fieldValue !== null && fieldValue !== undefined) {
      return {
        badge: {
          text: String(fieldValue),
          class: HM_ConfigurableTile.CSS_CLASSES.BADGE_UP,
          icon: HM_ConfigurableTile.DEFAULT_ICON
        }
      };
    }

    return { badge: null };
  }

  /**
   * @description Extract tile icon from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @return {String|null} Icon name or null if not found
   */
  extractTileIcon(mapIndex, data) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_ICON);
    if (!map) {
      return null;
    }

    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    if (fieldValue) {
      return String(fieldValue);
    }

    return null;
  }

  /**
   * @description Get icon class based on icon name
   * Returns alert class for warning/alert icons, brand class otherwise
   * @param {String} iconName - Icon name to check
   * @return {String} CSS class for icon
   */
  getIconClass(iconName) {
    if (
      iconName &&
      (iconName.includes("warning") || iconName.includes("alert"))
    ) {
      return "cc-kpi-icon cc-kpi-icon--alert";
    }
    return "cc-kpi-icon cc-kpi-icon--brand";
  }

  /**
   * @description Get formatted subtitle from data (checks for specific subtitle fields)
   * Checks for pre-formatted subtitle fields from Apex methods
   * @param {Object} data - Data object to check for subtitle fields
   * @return {String|null} Formatted subtitle or null if not found
   */
  getFormattedSubtitle(data) {
    // Check for formatted subtitle fields from Apex
    if (data.pipelineSubtitle) return data.pipelineSubtitle;
    if (data.closedWonSubtitle) return data.closedWonSubtitle;
    if (data.casesPendingSubtitle) return data.casesPendingSubtitle;
    if (data.activeAccountsSubtitle) return data.activeAccountsSubtitle;
    return null;
  }


  /**
   * @description Get field value from data object (supports dot notation)
   * Supports nested fields like "Account.Name"
   * @param {Object} data - Data object to get value from
   * @param {String} fieldPath - Field path (supports dot notation)
   * @return {*} Field value or null if not found
   */
  getFieldValue(data, fieldPath) {
    if (!data || !fieldPath) {
      return null;
    }

    const parts = fieldPath.split(".");
    let value = data;

    for (const part of parts) {
      if (value && typeof value === "object") {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * @description Format value based on format type
   * Delegates to shared formatting utilities
   * @param {*} value - Value to format
   * @param {String} formatType - Format type (Currency, Number, Percent, Date)
   * @return {String} Formatted value string
   */
  formatValue(value, formatType) {
    if (value === null || value === undefined) {
      return "0";
    }

    switch (formatType) {
      case "Currency":
        return this.formatCurrency(value);
      case "Number":
        return this.formatNumber(value);
      case "Percent":
        return this.formatPercent(value);
      case "Date":
        return this.formatDate(value);
      default:
        return String(value);
    }
  }

  /**
   * @description Format change indicator with sign prefix
   * @param {*} value - Numeric value to format as change
   * @param {String} formatType - Format type (Percent or Number)
   * @return {String} Formatted change string with + or - prefix
   */
  formatChange(value, formatType) {
    if (value === null || value === undefined) {
      return "0%";
    }

    const numValue = this.parseNumber(value);
    const sign = numValue >= 0 ? "+" : "";

    if (formatType === "Percent") {
      return `${sign}${numValue}%`;
    }
    return `${sign}${numValue}`;
  }

  /**
   * @description Parse number from value
   * @param {*} value - Value to parse as number
   * @return {Number} Parsed number, or 0 if invalid
   */
  parseNumber(value) {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const cleaned = value.replace("%", "").trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * @description Format currency value
   * @param {*} value - Numeric value to format
   * @return {String} Formatted currency string (e.g., $1.5M, $5K, $100)
   */
  formatCurrency(value) {
    const num = this.parseNumber(value);
    if (isNaN(num)) {
      return String(value);
    }
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toFixed(0)}`;
  }

  /**
   * @description Format number value
   * @param {*} value - Numeric value to format
   * @return {String} Formatted number string with locale formatting
   */
  formatNumber(value) {
    const num = this.parseNumber(value);
    if (isNaN(num)) {
      return String(value);
    }
    return num.toLocaleString();
  }

  /**
   * @description Format percent value
   * @param {*} value - Numeric value to format (0.5 = 50%)
   * @return {String} Formatted percent string
   */
  formatPercent(value) {
    const num = this.parseNumber(value);
    if (isNaN(num)) {
      return String(value);
    }
    return `${num.toFixed(1)}%`;
  }

  /**
   * @description Format datetime value
   * @param {*} value - Datetime value to format
   * @return {String} Formatted datetime string
   */
  formatDateTime(value) {
    if (!value) {
      return "";
    }

    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        return "";
      }
      return value.toLocaleString();
    }

    if (typeof value === "string") {
      let date = new Date(value);

      if (isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        date = new Date(value);
      }

      if (isNaN(date.getTime()) && /^\d+$/.test(value)) {
        date = new Date(parseInt(value, 10));
      }

      if (isNaN(date.getTime())) {
        return value;
      }

      return date.toLocaleString();
    }

    return String(value);
  }

  /**
   * @description Format date value
   * @param {*} value - Date value to format
   * @return {String} Formatted date string
   */
  formatDate(value) {
    if (!value) {
      return "";
    }

    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        return "";
      }
      return value.toLocaleDateString();
    }

    if (typeof value === "string") {
      let date = new Date(value);

      if (isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const dateOnly = value.substring(0, 10);
        date = new Date(dateOnly + "T00:00:00");
      }

      if (isNaN(date.getTime()) && /^\d+$/.test(value)) {
        date = new Date(parseInt(value, 10));
      }

      if (isNaN(date.getTime())) {
        return value;
      }

      return date.toLocaleDateString();
    }

    if (typeof value === "number") {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleDateString();
    }

    return String(value);
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
   * @description Get title from configuration
   */
  get title() {
    return this.componentConfig?.title || "";
  }

  /**
   * @description Get container class with dark mode support
   */
  get containerClass() {
    return this.isDarkMode ? "hm-tile-container cc-dark" : "hm-tile-container";
  }

  /**
   * @description Get tile CSS class
   */
  get tileClass() {
    return "cc-kpi-card";
  }

  /**
   * @description Handle tile click event
   * Placeholder for future navigation functionality
   * Currently no-op, can be extended for record navigation
   */
  handleTileClick() {
    // Navigation logic can be added here if needed in the future
  }
}