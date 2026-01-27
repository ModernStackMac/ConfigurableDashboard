import { LightningElement, api, wire } from "lwc";
import getComponentConfiguration from "@salesforce/apex/HM_DashboardConfigService.getComponentConfiguration";
import executeComponentQuery from "@salesforce/apex/HM_ComponentDataService.executeComponentQuery";

/**
 * @description Configurable tile component for displaying KPI metrics
 * Accepts componentId and retrieves configuration and data dynamically.
 * 
 * Key capabilities:
 * - Display aggregate values (COUNT, SUM, AVG, etc.) or first row from LIST queries
 * - Configurable icon with background color styling
 * - Dynamic subtitle with merge field replacement ({value})
 * - Badge display for trend indicators (up/down/neutral)
 * - Multiple data sources for separate value, subtitle, and badge data
 * - Dark mode support
 */
export default class HM_ConfigurableTile extends LightningElement {
  // ==================== CONSTANTS ====================
  static MAP_TYPES = {
    TILE_VALUE: "Tile Value",
    TILE_BADGE: "Tile Badge"
  };

  static DEFAULT_ICON = "utility:info";
  static DEFAULT_VALUE = "0";

  static BADGE_ICONS = {
    UP: "utility:arrowup",
    DOWN: "utility:arrowdown"
  };

  static CSS_CLASSES = {
    ICON_BRAND: "cc-kpi-icon cc-kpi-icon--brand",
    ICON_ALERT: "cc-kpi-icon cc-kpi-icon--alert",
    ICON_SUCCESS: "cc-kpi-icon cc-kpi-icon--success",
    ICON_WARNING: "cc-kpi-icon cc-kpi-icon--warning",
    ICON_NO_BACKGROUND: "cc-kpi-icon cc-kpi-icon--no-background",
    BADGE_UP: "cc-kpi-badge cc-kpi-badge--up",
    BADGE_DOWN: "cc-kpi-badge cc-kpi-badge--down",
    BADGE_ZERO: "cc-kpi-badge cc-kpi-badge--zero"
  };

  // ==================== PUBLIC PROPERTIES ====================
  @api componentId;
  @api isDarkMode = false;
  @api containerSize = 'lg'; // Default to large for backward compatibility

  // Component configuration
  componentConfig = null;
  isLoading = true;
  error = null;

  // Tile data
  tileData = {
    value: "",
    subtitle: "",
    badge: null,
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
        const subtitleValue = response.subtitleValue || null;
        const badgeValue = response.badgeValue || null;
        if (response.shape === 'AGGREGATE') {
          // Use aggregate value directly
          this.processAggregateData(response.aggregateValue, response.aggregateType, subtitleValue, badgeValue);
        } else if (response.shape === 'LIST' && response.rows && response.rows.length > 0) {
          // Fallback: use first row (backward compatibility)
          this.processTileData(response.rows[0], subtitleValue, badgeValue);
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
    const iconName = this.componentConfig?.iconName || HM_ConfigurableTile.DEFAULT_ICON;
    return {
      value: HM_ConfigurableTile.DEFAULT_VALUE,
      subtitle: "",
      badge: null,
      iconName: iconName,
      iconClass: this.getIconClass(iconName)
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
   * @param {String} subtitleValue - Optional formatted subtitle value from backend
   * @param {String} badgeValue - Optional formatted badge value from backend
   */
  processAggregateData(aggregateValue, aggregateType, subtitleValue, badgeValue) {
    const detailMaps = this.componentConfig.detailMaps || [];
    const mapIndex = this.buildDetailMapIndex(detailMaps);
    
    // Extract tile properties from detail maps
    const valueMap = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_VALUE);
    let formattedValue;
    
    if (valueMap) {
      // Use formatType from the detail map (Currency, Number, Percent, Date, etc.)
      // This respects the Format Type field on the Component Detail Map
      formattedValue = this.formatValue(aggregateValue, valueMap.formatType);
    } else {
      // Fallback: format based on aggregate type if no mapping exists
      formattedValue = this.formatAggregateValue(aggregateValue, aggregateType);
    }
    
    // Extract badge - use badgeValue if provided (different data source), otherwise extract from aggregate
    const badgeMap = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_BADGE);
    let badgeData = { badge: null };
    
    if (badgeMap) {
      // If badgeValue is provided, badge comes from different data source
      if (badgeValue != null) {
        badgeData = this.extractTileBadge(mapIndex, null, badgeValue);
      } else {
        // Badge from same data source - extract from aggregate value
        badgeData = this.extractTileBadge(mapIndex, { value: aggregateValue }, null);
      }
    }
    
    const iconName = this.componentConfig.iconName || HM_ConfigurableTile.DEFAULT_ICON;
    const iconClass = this.getIconClass(iconName);

    // Process subtitle with value replacement
    const subtitleTemplate = this.componentConfig.subtitle || "";
    const processedSubtitle = this.processSubtitle(subtitleTemplate, subtitleValue);

    // Set tile data
    this.tileData = {
      value: formattedValue || HM_ConfigurableTile.DEFAULT_VALUE,
      subtitle: processedSubtitle,
      badge: badgeData.badge,
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
   * Extracts value and badge from detail maps, uses component fields for subtitle and icon
   * @param {Object} data - Data object containing field values
   * @param {String} subtitleValue - Optional formatted subtitle value from backend
   * @param {String} badgeValue - Optional formatted badge value from backend
   */
  processTileData(data, subtitleValue, badgeValue) {
    const detailMaps = this.componentConfig.detailMaps || [];
    const mapIndex = this.buildDetailMapIndex(detailMaps);

    // Extract values from detail maps using indexed lookup
    const value = this.extractTileValue(mapIndex, data);
    
    // Extract badge - use badgeValue if provided (different data source), otherwise extract from data
    const badgeMap = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_BADGE);
    let badgeData = { badge: null };
    
    if (badgeMap) {
      // If badgeValue is provided, badge comes from different data source
      if (badgeValue != null) {
        badgeData = this.extractTileBadge(mapIndex, null, badgeValue);
      } else {
        // Badge from same data source - extract from data object
        badgeData = this.extractTileBadge(mapIndex, data, null);
      }
    }
    
    // Use component fields for subtitle and icon
    const iconName = this.componentConfig.iconName || HM_ConfigurableTile.DEFAULT_ICON;
    const iconClass = this.getIconClass(iconName);

    // Process subtitle with value replacement
    const subtitleTemplate = this.componentConfig.subtitle || "";
    const processedSubtitle = this.processSubtitle(subtitleTemplate, subtitleValue);

    // Set initial tile data
    this.tileData = {
      value: value || HM_ConfigurableTile.DEFAULT_VALUE,
      subtitle: processedSubtitle,
      badge: badgeData.badge,
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

    // Data source validation is handled by the backend - detail map references
    // a specific data source by name, but we process whatever data was returned.
    // This allows graceful degradation when data sources are reconfigured.

    const fieldValue = this.getFieldValue(data, map.fieldApiName);
    return this.formatValue(fieldValue, map.formatType);
  }


  /**
   * @description Extract tile badge from detail maps using indexed lookup
   * @param {Map} mapIndex - Indexed map of detail maps by map type
   * @param {Object} data - Data object containing field values
   * @param {String} badgeValue - Optional formatted badge value from backend (when from different data source)
   * @return {Object} Badge object with text, class, and icon, or null
   */
  extractTileBadge(mapIndex, data, badgeValue) {
    const map = mapIndex.get(HM_ConfigurableTile.MAP_TYPES.TILE_BADGE);
    if (!map) {
      return { badge: null };
    }

    // Data source validation is handled by the backend - we process whatever data was returned

    // Get raw value - prefer badgeValue from backend if provided (different data source), otherwise extract from data
    let rawValue = null;
    if (badgeValue != null) {
      // Badge value from different data source - parse it to get numeric value
      rawValue = this.parseNumericValue(badgeValue);
    } else {
      // Badge from same data source - extract from data object
      rawValue = this.getFieldValue(data, map.fieldApiName);
      // Convert to number if it's a string
      if (rawValue != null && typeof rawValue === 'string') {
        rawValue = this.parseNumericValue(rawValue);
      }
    }

    if (rawValue === null || rawValue === undefined) {
      return { badge: null };
    }

    // Determine badge direction and styling
    const direction = this.determineBadgeDirection(rawValue);
    
    // Format the value using formatType from detail map
    let formattedText = this.formatValue(rawValue, map.formatType);
    
    // For percentage values, ensure sign is included for positive values
    // Negative values should already have the sign from formatPercent
    if (map.formatType === 'Percent') {
      if (rawValue > 0 && !formattedText.startsWith('+')) {
        formattedText = '+' + formattedText;
      }
      // Negative values should already have '-' sign from formatPercent
    }

    // Build badge object based on direction
    let badgeClass = HM_ConfigurableTile.CSS_CLASSES.BADGE_ZERO;
    let badgeIcon = null;

    if (direction.direction === 'up') {
      badgeClass = HM_ConfigurableTile.CSS_CLASSES.BADGE_UP;
      badgeIcon = HM_ConfigurableTile.BADGE_ICONS.UP;
    } else if (direction.direction === 'down') {
      badgeClass = HM_ConfigurableTile.CSS_CLASSES.BADGE_DOWN;
      badgeIcon = HM_ConfigurableTile.BADGE_ICONS.DOWN;
    }
    // else: zero - use default grey styling, no icon

    return {
      badge: {
        text: formattedText,
        class: badgeClass,
        icon: badgeIcon
      }
    };
  }

  /**
   * @description Parse numeric value from formatted string
   * Handles percentages, currency, and plain numbers
   * @param {String|Number} value - Formatted string or number
   * @return {Number} Numeric value, or null if cannot parse
   */
  parseNumericValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    // If already a number, return it
    if (typeof value === 'number') {
      return value;
    }

    // Convert to string for parsing
    const str = String(value).trim();

    // Remove currency symbols and commas
    let cleaned = str.replace(/[$,\s]/g, '');

    // Handle percentages - remove % and divide by 100 if needed
    if (cleaned.includes('%')) {
      cleaned = cleaned.replace('%', '');
      // If value is already a percentage (0-100 range), keep as is
      // If value is decimal (0-1 range), multiply by 100
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        // Check if it's likely a percentage (absolute value > 1) or decimal
        if (Math.abs(num) <= 1 && num !== 0) {
          return num * 100; // Convert decimal to percentage
        }
        return num;
      }
    }

    // Parse as float
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * @description Determine badge direction and styling based on numeric value
   * @param {Number} numericValue - Numeric value to evaluate
   * @return {Object} Direction object with direction ('up'|'down'|'zero') and numericValue
   */
  determineBadgeDirection(numericValue) {
    if (numericValue === null || numericValue === undefined || isNaN(numericValue)) {
      return { direction: 'zero', numericValue: 0 };
    }

    const num = Number(numericValue);
    
    if (num > 0) {
      return { direction: 'up', numericValue: num };
    }
    if (num < 0) {
      return { direction: 'down', numericValue: num };
    }
    return { direction: 'zero', numericValue: 0 };
  }

  /**
   * @description Get icon class based on icon background color configuration
   * Uses component's iconBackgroundColor picklist value to determine styling
   * @param {String} _iconName - Unused parameter retained for API stability. Icon class is
   *                             determined solely by iconBackgroundColor, not the icon name.
   *                             Callers pass iconName by convention but it's not processed.
   * @return {String} CSS class for icon container styling
   */
  getIconClass(_iconName) {  // eslint-disable-line no-unused-vars
    const bgColor = this.componentConfig?.iconBackgroundColor;
    
    // If no background color or "None", return no-background class
    if (!bgColor || bgColor === 'None') {
      return HM_ConfigurableTile.CSS_CLASSES.ICON_NO_BACKGROUND;
    }
    
    // Map background color to CSS class
    const colorClassMap = {
      'Brand': HM_ConfigurableTile.CSS_CLASSES.ICON_BRAND,
      'Alert': HM_ConfigurableTile.CSS_CLASSES.ICON_ALERT,
      'Success': HM_ConfigurableTile.CSS_CLASSES.ICON_SUCCESS,
      'Warning': HM_ConfigurableTile.CSS_CLASSES.ICON_WARNING
    };
    
    return colorClassMap[bgColor] || HM_ConfigurableTile.CSS_CLASSES.ICON_NO_BACKGROUND;
  }



  /**
   * @description Get field value from data object (supports dot notation)
   * Supports nested fields like "Account.Name" for parent relationships
   * @param {Object} data - Data object to get value from
   * @param {String} fieldPath - Field path (supports dot notation for nested fields)
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
    // Normalize formatType to handle case variations and null/undefined
    const normalizedFormatType = formatType ? String(formatType).trim() : null;
    
    if (value === null || value === undefined) {
      // Return formatted zero based on format type
      if (normalizedFormatType === "Currency") {
        return "$0";
      }
      return "0";
    }

    switch (normalizedFormatType) {
      case "Currency":
        return this.formatCurrency(value);
      case "Number":
        return this.formatNumber(value);
      case "Percent":
        return this.formatPercent(value);
      case "Date":
        return this.formatDate(value);
      default:
        // If formatType is not set or invalid, return as string
        return String(value);
    }
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
   * @return {String} Formatted currency string (e.g., $1.5M, $5K, $100, $0)
   */
  formatCurrency(value) {
    const num = this.parseNumber(value);
    if (isNaN(num)) {
      // If value can't be parsed as number, return as string with $ prefix
      return `$${String(value)}`;
    }
    // Handle zero explicitly
    if (num === 0) {
      return "$0";
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
   * @description Get subtitle from configuration
   */
  get subtitle() {
    return this.tileData?.subtitle || this.componentConfig?.subtitle || "";
  }

  /**
   * @description Process subtitle template by replacing {value} placeholder
   * @param {String} subtitleTemplate - Subtitle template with optional {value} placeholder
   * @param {String} subtitleValue - Formatted value to replace {value} placeholder
   * @return {String} Processed subtitle with value replaced, or template as-is if no value
   */
  processSubtitle(subtitleTemplate, subtitleValue) {
    if (!subtitleTemplate) {
      return "";
    }
    
    // If no subtitle value provided, return template as-is
    if (!subtitleValue) {
      return subtitleTemplate;
    }
    
    // Replace all occurrences of {value} with the formatted value
    return subtitleTemplate.replace(/{value}/g, subtitleValue);
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
   * @description Handle keyboard interaction for card accessibility
   * Allows Enter and Space keys to activate the card like a click
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleCardKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // Dispatch custom event for parent components to handle navigation
      this.dispatchEvent(new CustomEvent("cardactivate", {
        detail: { componentId: this.componentId }
      }));
    }
  }

  /**
   * @description Get title class with truncation
   * Applies truncation on all container sizes to prevent wrapping and maintain consistent card heights
   * @return {String} CSS class string for title (always slds-truncate)
   */
  get titleClass() {
    return 'slds-truncate';
  }

}