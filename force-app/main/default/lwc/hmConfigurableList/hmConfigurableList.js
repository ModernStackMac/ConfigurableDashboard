import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getComponentConfiguration from "@salesforce/apex/HM_DashboardConfigService.getComponentConfiguration";
import executeComponentQuery from "@salesforce/apex/HM_ComponentDataService.executeComponentQuery";

/**
 * @description Configurable list component for displaying tabular data
 * Displays records from SOQL queries defined in Data Source configurations.
 * 
 * Key capabilities:
 * - Object-specific column visibility based on record type
 * - Pagination with configurable page size
 * - Column sorting (ascending/descending)
 * - Dynamic filters based on object types in data
 * - Custom badge rendering for date fields (days until/over)
 * - Row icons from data source configuration
 * - Dark mode support
 */
export default class HM_ConfigurableList extends NavigationMixin(
  LightningElement
) {
  // ==================== CONSTANTS ====================
  static MAP_TYPES = {
    LIST_COLUMN: "List Column"
  };

  static FORMAT_TYPES = {
    CURRENCY: "Currency",
    NUMBER: "Number",
    PERCENT: "Percent",
    DATE: "Date",
    TEXT: "Text"
  };

  static DEFAULT_PAGE_SIZE = 25;
  static DEFAULT_TITLE = "List";

  static CSS_CLASSES = {
    FILTER_ACTIVE: "cc-filter-btn cc-filter-btn-active",
    FILTER_INACTIVE: "cc-filter-btn",
    PAGINATION_PAGE: "cc-pagination-page",
    PAGINATION_PAGE_ACTIVE: "cc-pagination-page cc-pagination-page-active",
    COL_DATA: "cc-col-data",
    COL_SORTABLE: "cc-col-sortable",
    COL_SORTED: "cc-col-sorted",
    CONTAINER: "cc-container",
    CONTAINER_DARK: "cc-container cc-dark"
  };

  static SORT_DIRECTIONS = {
    ASC: "asc",
    DESC: "desc"
  };

  static SORT_ICONS = {
    ASC: "utility:arrowup",
    DESC: "utility:arrowdown"
  };

  static BADGE_TYPES = {
    DAYS_UNTIL_OVER: "Days Until/Over",
    DAYS_LEFT: "Days Left",
    NONE: "None"
  };

  static OBJECT_PREFIXES = {
    ACCOUNT: "001",
    CONTACT: "003",
    OPPORTUNITY: "006",
    CASE: "500"
  };

  static OBJECT_TYPES = {
    ACCOUNT: "Account",
    CONTACT: "Contact",
    OPPORTUNITY: "Opportunity",
    CASE: "Case",
    UNKNOWN: "Unknown"
  };

  // ==================== PUBLIC PROPERTIES ====================
  @api componentId;
  @api isDarkMode = false;

  // Component state
  componentConfig = null;
  columns = [];
  rows = [];
  filteredRows = [];
  isLoading = true;
  errorMessage = null;

  // Filter state
  filters = [];
  activeFilter = null; // null means no filter (show all)

  // Pagination state
  currentPage = 1;
  recordsPerPage = HM_ConfigurableList.DEFAULT_PAGE_SIZE;
  enablePagination = false;
  totalPages = 1;

  // Sorting state
  sortColumn = null;
  sortDirection = HM_ConfigurableList.SORT_DIRECTIONS.ASC;
  enableColumnSorting = false;

  // Cache for performance optimization
  _cachedVisibleColumns = null;
  _cachedVisibleColumnsFilter = null;
  _cachedObjectTypes = null;
  _cachedObjectTypesRows = null;

  /**
   * @description Wire component configuration
   */
  @wire(getComponentConfiguration, { componentId: "$componentId" })
  wiredConfig(result) {
    const { error, data } = result;

    if (data) {
      this.componentConfig = data;
      this.errorMessage = null;
      // Set pagination configuration
      this.enablePagination = data.enablePagination || false;
      this.recordsPerPage = data.recordsPerPage || HM_ConfigurableList.DEFAULT_PAGE_SIZE;
      // Set sorting configuration
      this.enableColumnSorting = data.enableColumnSorting || false;
      this.buildColumns();
      // Invalidate caches when config changes
      this._cachedVisibleColumns = null;
      this._cachedVisibleColumnsFilter = null;
      this._cachedObjectTypes = null;
      this._cachedObjectTypesRows = null;
      // Note: activeFilter will be set in buildFilters() when data loads
      this.loadData();
    } else if (error) {
      this.errorMessage = this.extractErrorMessage(error);
      this.isLoading = false;
    }
  }

  /**
   * @description Extract error message from error object
   * Handles various error formats from Apex and JavaScript
   * @param {Error|Object|String} error - Error object or string
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
   * @description Get default list data structure
   * @return {Object} Default list data object
   */
  getDefaultListData() {
    return {
      rows: [],
      filteredRows: [],
      filters: [],
      columns: [],
      currentPage: 1,
      totalPages: 1,
      errorMessage: null
    };
  }

  /**
   * @description Build column definitions from detail maps
   */
  buildColumns() {
    if (!this.componentConfig?.detailMaps) {
      this.columns = [];
      // Invalidate cache when columns change
      this._cachedVisibleColumns = null;
      this._cachedVisibleColumnsFilter = null;
      return;
    }

    this.columns = this.componentConfig.detailMaps
      .filter((map) => map.mapType === HM_ConfigurableList.MAP_TYPES.LIST_COLUMN)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((map) => {
        const column = {
          key: map.id, // Use detail map ID as unique key
          id: map.id, // Store detail map ID for reference
          label: map.label || map.fieldApiName,
          fieldApiName: map.fieldApiName,
          formatType: map.formatType || HM_ConfigurableList.FORMAT_TYPES.TEXT,
          objectType: map.objectType || [], // List of object types this column applies to
          cssClass: map.fieldApiName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          sortable: this.enableColumnSorting, // Column is sortable if sorting is enabled globally
          sortDirection: null, // Track sort direction for this column
          badgeType: map.columnBadgeType || null, // Badge type for this column
          badgeVariant: map.columnBadgeVariant || null // Badge color variant override
        };
        
        // Compute header class, title, and alternative text
        column.headerClass = this.computeColumnHeaderClass(column);
        column.sortIcon = null; // Will be set when sorted
        column.title = column.sortable ? "Click to sort" : ""; // Pre-compute title for template
        column.sortAlternativeText = ""; // Will be set when sorted
        
        return column;
      });

    // Invalidate cache when columns change
    this._cachedVisibleColumns = null;
    this._cachedVisibleColumnsFilter = null;
  }

  /**
   * @description Load data from Apex service
   * Validates component configuration and processes response based on shape
   */
  async loadData() {
    if (!this.validateLoadDataInputs()) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const response = await executeComponentQuery({
        componentId: this.componentId,
        context: {}
      });

      if (!this.processDataResponse(response)) {
        return;
      }

      this.buildFilters();
      this.applyFilter();
      this.updatePagination();
    } catch (error) {
      this.handleLoadDataError(error);
    } finally {
      this.isLoading = false;
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
   * @description Validate inputs for loadData method
   * @return {Boolean} True if inputs are valid, false otherwise
   */
  validateLoadDataInputs() {
    if (!this.componentConfig || !this.componentId) {
      this.isLoading = false;
      return false;
    }

    if (typeof this.componentId !== 'string' || this.componentId.trim().length === 0) {
      this.errorMessage = 'Invalid component ID';
      this.isLoading = false;
      return false;
    }

    return true;
  }

  /**
   * @description Process data response from Apex service
   * @param {Object} response - Response object from executeComponentQuery
   * @return {Boolean} True if processing succeeded, false if error occurred
   */
  processDataResponse(response) {
    if (!response || !response.success) {
      this.rows = this.formatRows([]);
      return true;
    }

    if (response.shape === 'LIST') {
      this.rows = this.formatRows(response.rows || []);
      // Invalidate caches when data changes
      this._cachedVisibleColumns = null;
      this._cachedVisibleColumnsFilter = null;
      this._cachedObjectTypes = null;
      this._cachedObjectTypesRows = null;
      return true;
    }

    if (response.shape === 'AGGREGATE') {
      this.setErrorAndResetData('List component requires LIST shape');
      return false;
    }

    this.setErrorAndResetData('Unknown response shape: ' + response.shape);
    return false;
  }

  /**
   * @description Set error message and reset data to defaults
   * @param {String} errorMsg - Error message to set
   */
  setErrorAndResetData(errorMsg) {
    this.errorMessage = errorMsg;
    const defaultData = this.getDefaultListData();
    this.rows = defaultData.rows;
    this.filteredRows = defaultData.filteredRows;
    this.filters = defaultData.filters;
  }

  /**
   * @description Handle errors during data loading
   * @param {Error} error - Error object from catch block
   */
  handleLoadDataError(error) {
    this.errorMessage = this.extractErrorMessage(error);
    const defaultData = this.getDefaultListData();
    this.rows = defaultData.rows;
    this.filteredRows = defaultData.filteredRows;
    this.filters = defaultData.filters;
  }


  /**
   * @description Format raw data into rows with cells
   * @param {Array} data - Array of record objects to format
   * @return {Array} Array of row objects with cells, icons, and metadata
   */
  formatRows(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return data.map((record, index) => {
      const recordId = record.Id || record.recordId || `row-${index}`;
      const objectType = this.getObjectType(record);
      // Get icon from data source icon (set by Apex service)
      const rowIcon = record.dataSourceIcon || null;

      // Build cells for this row - include all columns but set null for non-applicable ones
      const cells = this.columns.map((column) => {
        return this.createCellForColumn(record, column, objectType);
      });

      const row = {
        id: recordId,
        recordId: recordId,
        objectType: objectType,
        rowIcon: rowIcon,
        cells: cells,
        visibleCells: cells, // Initially show all cells, will be filtered in applyFilter()
        record: record
      };

      return row;
    });
  }

  /**
   * @description Create a cell for a specific column from a record
   * @param {Object} record - The data record
   * @param {Object} column - The column definition
   * @param {String} objectType - The object type of the record
   * @return {Object} Cell object with key, value, rawValue, and applicable flag
   */
  createCellForColumn(record, column, objectType) {
    // Check if column applies to this object type
    const applies = this.columnAppliesToObject(column, objectType);
    
    if (!applies) {
      // Return object with key (detail map ID) but null value - template will hide it
      return {
        key: column.key, // Detail map ID
        value: null,
        rawValue: null,
        applicable: false
      };
    }

    // Get field value - handle smart Name column that shows Name or CaseNumber based on object type
    let value;
    if (column.isSmartNameColumn && column.isVirtual) {
      // For smart Name column: use CaseNumber for Case, Name for others
      if (objectType === 'Case') {
        value = this.getFieldValue(record, 'CaseNumber');
      } else {
        value = this.getFieldValue(record, 'Name');
      }
    } else {
      value = this.getFieldValue(record, column.fieldApiName);
    }
    
    let formattedValue = this.formatValue(value, column.formatType);
    
    // If formatted value is empty but we have a raw value, use the raw value as fallback
    if (!formattedValue && value != null) {
      formattedValue = String(value);
    }
    
    // If still empty, show a placeholder to indicate the field exists but has no value
    if (!formattedValue) {
      formattedValue = ""; // Empty string - will show nothing but cell will still render
    }

    // Calculate badge if badge type is configured
    // Support both "Days Until/Over" (new) and "Days Left" (old) for backward compatibility
    let badge = null;
    if ((column.badgeType === HM_ConfigurableList.BADGE_TYPES.DAYS_UNTIL_OVER || 
         column.badgeType === HM_ConfigurableList.BADGE_TYPES.DAYS_LEFT) && value != null) {
      try {
        badge = this.calculateDaysBadge(value, column.badgeVariant);
      } catch {
        // Graceful degradation: Badge calculation is non-critical UI enhancement.
        // If calculation fails (invalid date format, etc.), continue without badge
        // rather than breaking row rendering. Badge will be null and row displays normally.
        badge = null;
      }
    }

    // If badge type is configured, hide the field value and show only badge
    const hasBadgeType = column.badgeType != null && column.badgeType !== HM_ConfigurableList.BADGE_TYPES.NONE;
    
    return {
      key: column.key, // Detail map ID - ensures unique key even if same fieldApiName used for different objects
      value: formattedValue,
      rawValue: value,
      applicable: true,
      badge: badge,
      hasBadgeType: hasBadgeType // Flag to hide value when badge type is configured
    };
  }

  /**
   * @description Calculate days badge for date fields
   * @param {Object} dateValue - Date or DateTime value from record
   * @param {String} overrideVariant - Optional override variant from configuration
   * @return {Object} Badge object with text and variant, or null if invalid
   */
  calculateDaysBadge(dateValue, overrideVariant = null) {
    if (!dateValue) {
      return null;
    }

    try {
      // Handle Date and DateTime values
      let date;
      if (dateValue instanceof Date) {
        date = dateValue;
      } else if (typeof dateValue === "string") {
        // Parse date string from Salesforce
        // Salesforce dates can be in format: "2025-11-14" or "2025-11-14T00:00:00.000Z"
        // Try parsing directly first
        date = new Date(dateValue);
        
        // If that fails, try parsing as YYYY-MM-DD format
        if (isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
          const dateOnly = dateValue.substring(0, 10);
          date = new Date(dateOnly + "T00:00:00");
        }
      } else if (typeof dateValue === "number") {
        // Handle timestamp
        date = new Date(dateValue);
      } else {
        return null;
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return null;
      }

      // Calculate days difference from today
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate day calculation
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);

      const diffTime = targetDate - today;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Format badge text
      let badgeText;
      let variant;
      
      // Extract base variant name from picklist value (e.g., "Warning (Orange)" -> "warning")
      let baseVariant = null;
      if (overrideVariant && overrideVariant !== "Auto") {
        // Handle picklist values like "Warning (Orange)", "Success (Green)", "Error (Red)"
        const variantMatch = overrideVariant.match(/^(Success|Warning|Error)/i);
        if (variantMatch) {
          baseVariant = variantMatch[1].toLowerCase();
        } else {
          baseVariant = overrideVariant.toLowerCase();
        }
      }
      
      let iconName;
      if (diffDays > 0) {
        badgeText = `${diffDays}d Left`;
        // Use override variant if provided, otherwise calculate based on days
        variant = baseVariant || (diffDays <= 3 ? "warning" : "success");
        iconName = "utility:clock";
      } else if (diffDays < 0) {
        badgeText = `${Math.abs(diffDays)}d Over`;
        variant = baseVariant || "error";
        iconName = "utility:warning";
      } else {
        badgeText = "Today";
        variant = baseVariant || "warning";
        iconName = "utility:clock";
      }

      return {
        text: badgeText,
        variant: variant,
        icon: iconName,
        className: `cc-custom-badge cc-badge-${variant}` // Pre-computed class name for template
      };
    } catch {
      // If calculation fails, return null (no badge)
      return null;
    }
  }

  /**
   * @description Get object type from record
   * Attempts multiple strategies: attributes.type, recordType field, objectType field, or Id prefix
   * @param {Object} record - Record object to extract type from
   * @return {String} Object type name (Account, Contact, Opportunity, Case, or Unknown)
   */
  getObjectType(record) {
    // Try attributes.type first (from Apex)
    if (record.attributes?.type) {
      return record.attributes.type;
    }
    // Try recordType field
    if (record.recordType) {
      return record.recordType;
    }
    // Try objectType field (set by wrapper conversion)
    if (record.objectType) {
      return record.objectType;
    }
    // Try to infer from Id prefix
    if (record.Id) {
      const prefix = record.Id.substring(0, 3);
      const prefixMap = {
        [HM_ConfigurableList.OBJECT_PREFIXES.ACCOUNT]: HM_ConfigurableList.OBJECT_TYPES.ACCOUNT,
        [HM_ConfigurableList.OBJECT_PREFIXES.CONTACT]: HM_ConfigurableList.OBJECT_TYPES.CONTACT,
        [HM_ConfigurableList.OBJECT_PREFIXES.OPPORTUNITY]: HM_ConfigurableList.OBJECT_TYPES.OPPORTUNITY,
        [HM_ConfigurableList.OBJECT_PREFIXES.CASE]: HM_ConfigurableList.OBJECT_TYPES.CASE
      };
      if (prefixMap[prefix]) {
        return prefixMap[prefix];
      }
    }
    return HM_ConfigurableList.OBJECT_TYPES.UNKNOWN;
  }


  /**
   * @description Check if any rows have icons configured
   * Used to conditionally render icon column
   * @return {Boolean} True if any row has an icon
   */
  get hasRowIcons() {
    if (!this.rows || this.rows.length === 0) {
      return false;
    }
    
    return this.rows.some(row => row.rowIcon && row.rowIcon.trim().length > 0);
  }

  /**
   * @description Check if column applies to object type
   * Columns with no objectType restriction apply to all object types
   * @param {Object} column - Column definition with optional objectType array
   * @param {String} objectType - Object type to check against
   * @return {Boolean} True if column applies to the object type, false otherwise
   */
  columnAppliesToObject(column, objectType) {
    // If no objectType filter, applies to all
    if (!column.objectType || column.objectType.length === 0) {
      return true;
    }
    // Check if objectType is in the list
    return column.objectType.includes(objectType);
  }

  /**
   * @description Find cell for a column in a row using unique detail map ID key
   * For virtual columns, creates the cell on-the-fly if it doesn't exist
   * @param {Object} row - The row object containing cells
   * @param {Object} column - The column definition (key is detail map ID or virtual key)
   * @return {Object} Cell object or placeholder if not found
   */
  findCellForColumn(row, column) {
    if (!row || !column) {
      return {
        key: column?.key || '',
        value: null,
        rawValue: null,
        applicable: false
      };
    }

    // For virtual columns, create cell on-the-fly
    if (column.isVirtual && row.record) {
      // For smart Name column, we need to handle it specially
      if (column.isSmartNameColumn) {
        // Create a temporary column object that uses the right field
        const tempColumn = { ...column };
        if (row.objectType === 'Case') {
          tempColumn.fieldApiName = 'CaseNumber';
        } else {
          tempColumn.fieldApiName = 'Name';
        }
        return this.createCellForColumn(row.record, tempColumn, row.objectType);
      }
      return this.createCellForColumn(row.record, column, row.objectType);
    }

    // For regular columns, find in existing cells
    if (!row.cells) {
      return {
        key: column.key,
        value: null,
        rawValue: null,
        applicable: false
      };
    }

    // Find cell by unique detail map ID key
    const cell = row.cells.find((c) => c && c.key === column.key);
    
    // Return the cell if found, otherwise create a placeholder
    return cell || {
      key: column.key, // Detail map ID
      value: null,
      rawValue: null,
      applicable: false
    };
  }

  /**
   * @description Get visible columns based on active filter
   * When "All" is selected and showAllRecordsFilter is enabled:
   *   - Shows columns with no objectType restriction (empty array)
   *   - Automatically includes Name and CreatedDate if they exist in data
   * When a specific object type is selected, shows only columns that apply to that type
   * Results are cached to avoid recalculation on every access
   */
  get visibleColumns() {
    // Check cache - invalidate if filter, columns, rows, or config changed
    const cacheKey = `${this.activeFilter}_${this.columns.length}_${this.rows.length}_${this.componentConfig?.showAllRecordsFilter}`;
    if (this._cachedVisibleColumns && this._cachedVisibleColumnsFilter === cacheKey) {
      return this._cachedVisibleColumns;
    }

    let result;
    // Handle "All" filter
    if (!this.activeFilter || this.activeFilter === "all") {
      // Get columns with no objectType restriction (empty array)
      let visibleCols = this.columns.filter((column) => {
        return !column.objectType || column.objectType.length === 0;
      });

      // If showAllRecordsFilter is enabled, automatically add Name/CaseNumber and CreatedDate if they exist in data
      const showAllRecordsFilter = this.componentConfig?.showAllRecordsFilter === true;
      if (showAllRecordsFilter && this.rows && this.rows.length > 0) {
        // Get unique object types in the data
        const objectTypes = this.getUniqueObjectTypes();
        const hasCase = objectTypes.includes('Case');
        const hasAccount = objectTypes.includes('Account');
        const hasOpportunity = objectTypes.includes('Opportunity');
        const hasAccountOrOpp = hasAccount || hasOpportunity;

        // Check if these columns already exist in configured columns WITH empty objectType (already visible in "All" tab)
        const hasNameColumnWithNoRestriction = this.columns.some(
          col => col.fieldApiName === 'Name' && (!col.objectType || col.objectType.length === 0)
        );
        // Note: CaseNumber check not needed since smart Name column handles both Name and CaseNumber display
        const hasCreatedDateColumnWithNoRestriction = this.columns.some(
          col => col.fieldApiName === 'CreatedDate' && (!col.objectType || col.objectType.length === 0)
        );

        // Add Name column if we have Account/Opportunity OR Case records
        // This single column will display Name for Account/Opportunity and CaseNumber for Case
        if ((hasAccountOrOpp || hasCase) && !hasNameColumnWithNoRestriction) {
          const nameColumn = this.createVirtualColumn('Name', 'Name', HM_ConfigurableList.FORMAT_TYPES.TEXT);
          // Mark it as a smart column that handles both Name and CaseNumber
          nameColumn.isSmartNameColumn = true;
          visibleCols.unshift(nameColumn); // Add at the beginning
        }

        // Always add CreatedDate if not already configured with no restriction
        // (Since we automatically inject CreatedDate into queries when showAllRecordsFilter is enabled)
        if (!hasCreatedDateColumnWithNoRestriction) {
          const createdDateColumn = this.createVirtualColumn('CreatedDate', 'Created Date', HM_ConfigurableList.FORMAT_TYPES.DATE);
          // Insert after Name
          const nameIndex = visibleCols.findIndex(col => col.fieldApiName === 'Name');
          if (nameIndex >= 0) {
            visibleCols.splice(nameIndex + 1, 0, createdDateColumn);
          } else {
            visibleCols.unshift(createdDateColumn);
          }
        }
      }

      result = visibleCols;
    } else {
      // Filter columns to only show those that apply to the active filter's object type
      result = this.columns.filter((column) =>
        this.columnAppliesToObject(column, this.activeFilter)
      );
    }

    // Cache result
    this._cachedVisibleColumns = result;
    this._cachedVisibleColumnsFilter = cacheKey;
    return result;
  }


  /**
   * @description Create a virtual column definition
   * Virtual columns are dynamically added (e.g., Name, CreatedDate) and not in the configured columns
   * These are created when showAllRecordsFilter is enabled and fields exist in data
   * @param {String} fieldApiName - Field API name
   * @param {String} label - Column label
   * @param {String} formatType - Format type (TEXT, CURRENCY, NUMBER, PERCENT, DATE)
   * @return {Object} Virtual column definition object
   */
  createVirtualColumn(fieldApiName, label, formatType) {
    const column = {
      key: `virtual-${fieldApiName}`, // Virtual key to distinguish from configured columns
      id: null, // No detail map ID for virtual columns
      label: label,
      fieldApiName: fieldApiName,
      formatType: formatType,
      objectType: [], // Empty array - applies to all object types
      cssClass: fieldApiName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      sortable: this.enableColumnSorting,
      sortDirection: null,
      badgeType: null,
      badgeVariant: null,
      isVirtual: true // Flag to identify virtual columns
    };

    // Compute header class, title, and alternative text
    column.headerClass = this.computeColumnHeaderClass(column);
    column.sortIcon = null;
    column.title = column.sortable ? "Click to sort" : "";
    column.sortAlternativeText = "";

    return column;
  }

  /**
   * @description Get unique object types from rows data
   * Results are cached to avoid recalculation on every access
   * @return {Array<String>} Array of unique object type names
   */
  getUniqueObjectTypes() {
    // Check cache - invalidate if rows changed
    if (this._cachedObjectTypes && this._cachedObjectTypesRows === this.rows) {
      return this._cachedObjectTypes;
    }

    if (!this.rows || this.rows.length === 0) {
      this._cachedObjectTypes = [];
      this._cachedObjectTypesRows = this.rows;
      return this._cachedObjectTypes;
    }

    const result = [...new Set(this.rows.map(row => row.objectType).filter(Boolean))];
    this._cachedObjectTypes = result;
    this._cachedObjectTypesRows = this.rows;
    return result;
  }

  /**
   * @description Infer object type from configuration or data when no filter is active
   * @return {String|null} Inferred object type or null if cannot be determined
   */
  inferObjectType() {
    // First, try to get object type from existing rows
    if (this.rows && this.rows.length > 0) {
      const uniqueObjectTypes = [...new Set(this.rows.map(row => row.objectType).filter(Boolean))];
      if (uniqueObjectTypes.length === 1) {
        return uniqueObjectTypes[0];
      }
    }

    // If no rows, try to infer from detail maps configuration
    if (this.componentConfig?.detailMaps) {
      const objectTypes = new Set();
      
      this.componentConfig.detailMaps.forEach((map) => {
        if (map.objectType && Array.isArray(map.objectType) && map.objectType.length > 0) {
          map.objectType.forEach(type => objectTypes.add(type));
        }
      });

      const uniqueTypes = Array.from(objectTypes);
      if (uniqueTypes.length === 1) {
        return uniqueTypes[0];
      }
    }

    return null;
  }

  /**
   * @description Get field value from record, supporting nested field paths
   * Handles dot notation for relationship fields (e.g., "Account.Name")
   * @param {Object} record - Record object containing field values
   * @param {String} fieldApiName - Field API name or dot-notation path
   * @return {*} Field value or null if not found
   */
  getFieldValue(record, fieldApiName) {
    if (!record || !fieldApiName) {
      return null;
    }

    // Handle nested fields (e.g., "Account.Name")
    const parts = fieldApiName.split(".");
    let value = record;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (value && typeof value === "object") {
        // Try exact match first
        if (Object.prototype.hasOwnProperty.call(value, part)) {
          value = value[part];
          } else {
            // Try case-insensitive match (for field name variations)
            const keys = Object.keys(value);
            const matchingKey = keys.find(key => key.toLowerCase() === part.toLowerCase());
            if (matchingKey) {
              value = value[matchingKey];
            } else {
              // Field not found - return null silently
              return null;
            }
          }
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * @description Format value based on format type
   * Delegates to specific formatters (currency, number, percent, date)
   * @param {*} value - Value to format (can be number, string, date, etc.)
   * @param {String} formatType - Format type (Currency, Number, Percent, Date, Text)
   * @return {String} Formatted value string
   */
  formatValue(value, formatType) {
    if (value === null || value === undefined) {
      return "";
    }

    switch (formatType) {
      case HM_ConfigurableList.FORMAT_TYPES.CURRENCY:
        return this.formatCurrency(value);
      case HM_ConfigurableList.FORMAT_TYPES.NUMBER:
        return this.formatNumber(value);
      case HM_ConfigurableList.FORMAT_TYPES.PERCENT:
        return this.formatPercent(value);
      case HM_ConfigurableList.FORMAT_TYPES.DATE:
        return this.formatDate(value);
      default:
        return String(value);
    }
  }


  /**
   * @description Handle row click - navigate to record
   */
  handleRowClick(event) {
    const recordId = event.currentTarget.dataset.recordId;
    const objectType = event.currentTarget.dataset.objectType;

    if (recordId && objectType) {
      this[NavigationMixin.Navigate]({
        type: "standard__recordPage",
        attributes: {
          recordId: recordId,
          objectApiName: objectType,
          actionName: "view"
        }
      });
    }
  }

  /**
   * @description Handle keyboard navigation for rows
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleRowKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleRowClick(event);
    }
  }

  /**
   * @description Handle keyboard navigation for column sort
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleColumnSortKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleColumnSort(event);
    }
  }

  /**
   * @description Get title from config
   */
  get title() {
    return this.componentConfig?.title || HM_ConfigurableList.DEFAULT_TITLE;
  }

  /**
   * @description Get subtitle from config
   */
  get subtitle() {
    return this.componentConfig?.subtitle || null;
  }

  /**
   * @description Get header icon from config
   * Returns icon name if exists and not blank, null otherwise
   */
  get headerIcon() {
    const iconName = this.componentConfig?.iconName;
    return iconName && iconName.trim().length > 0 ? iconName : null;
  }

  /**
   * @description Build dynamic filters based on object types in data
   * Creates filters for object types and optionally an "All" tab when setting is enabled
   * Only shows filters when there are 2+ different object types
   */
  buildFilters() {
    if (!this.rows || this.rows.length === 0) {
      this.filters = [];
      return;
    }

    // Count records by object type
    const typeCounts = {};

    this.rows.forEach((row) => {
      const objectType = row.objectType || "Unknown";
      typeCounts[objectType] = (typeCounts[objectType] || 0) + 1;
    });

    // Only build filters if there are 2+ different object types
    const objectTypes = Object.keys(typeCounts);
    if (objectTypes.length < 2) {
      this.filters = [];
      // If there's exactly one object type, set it as active filter
      if (objectTypes.length === 1) {
        this.activeFilter = objectTypes[0];
      } else {
        // No records - try to infer object type from configuration
        const inferredType = this.inferObjectType();
        if (inferredType) {
          this.activeFilter = inferredType;
        } else {
          this.activeFilter = null;
        }
      }
      return;
    }

    // Build filter array
    this.filters = [];

    // Check if "All" tab should be shown
    const showAllTab = this.componentConfig?.showAllRecordsFilter === true;
    
    // Add "All" tab if setting is enabled
    if (showAllTab) {
      const totalCount = this.rows.length;
      const isActive = this.activeFilter === null || this.activeFilter === "all";
      this.filters.push({
        value: "all",
        label: "All",
        count: totalCount,
        active: isActive,
        class: isActive
          ? HM_ConfigurableList.CSS_CLASSES.FILTER_ACTIVE
          : HM_ConfigurableList.CSS_CLASSES.FILTER_INACTIVE
      });
      
      // Set "All" as default if no filter is active
      if (this.activeFilter === null) {
        this.activeFilter = "all";
      }
    }

    // Sort object types alphabetically
    const sortedObjectTypes = objectTypes.sort();
    
    // Set first object type filter as active if no filter is currently active and "All" tab is not shown
    if (!showAllTab && this.activeFilter === null && sortedObjectTypes.length > 0) {
      this.activeFilter = sortedObjectTypes[0];
    }

    // Add filters for each object type
    sortedObjectTypes.forEach((objectType) => {
      const isActive = this.activeFilter === objectType;
      this.filters.push({
        value: objectType,
        label: objectType,
        count: typeCounts[objectType],
        active: isActive,
        class: isActive
          ? HM_ConfigurableList.CSS_CLASSES.FILTER_ACTIVE
          : HM_ConfigurableList.CSS_CLASSES.FILTER_INACTIVE
      });
    });
  }

  /**
   * @description Apply active filter to rows and update visible cells
   * Filters rows by object type and updates visible cells based on visibleColumns
   * Applies sorting if enabled and updates pagination
   */
  applyFilter() {
    // Filter rows by object type (if filter is active and not "all")
    if (this.activeFilter && this.activeFilter !== "all") {
      this.filteredRows = this.rows.filter(
        (row) => row.objectType === this.activeFilter
      );
    } else {
      // No filter or "all" - show all rows
      this.filteredRows = this.rows;
    }

    // Update visible cells for each filtered row based on active filter
    // IMPORTANT: Build visibleCells in the same order as visibleColumns to ensure alignment
    
    this.filteredRows.forEach((row) => {
      row.visibleCells = this.visibleColumns.map((column) => {
        return this.findCellForColumn(row, column);
      });
    });

    // Apply sorting if enabled and a column is selected
    // IMPORTANT: Sort the FULL filtered dataset before pagination
    if (this.enableColumnSorting && this.sortColumn) {
      // Check visibleColumns first (includes virtual columns), then configured columns
      let column = this.visibleColumns.find((col) => col.key === this.sortColumn);
      if (!column) {
        column = this.columns.find((col) => col.key === this.sortColumn);
      }
      
      if (column) {
        // Sort the entire filteredRows array (not just current page)
        this.filteredRows = this.sortRows(
          this.filteredRows,
          this.sortColumn,
          this.sortDirection,
          column.formatType
        );
      }
    }

    // Update filter active states and classes
    this.filters.forEach((filter) => {
      const isActive = filter.value === this.activeFilter;
      filter.active = isActive;
      filter.class = isActive
        ? HM_ConfigurableList.CSS_CLASSES.FILTER_ACTIVE
        : HM_ConfigurableList.CSS_CLASSES.FILTER_INACTIVE;
    });

    // Reset to first page when filter changes
    this.currentPage = 1;
    this.updatePagination();

    // Invalidate cache when filter changes
    this._cachedVisibleColumns = null;
    this._cachedVisibleColumnsFilter = null;
  }

  /**
   * @description Handle filter button click
   */
  handleFilterClick(event) {
    const filterValue = event.currentTarget.dataset.filter;
    if (filterValue) {
      this.activeFilter = filterValue;
      this.applyFilter();
    }
  }

  /**
   * @description Check if filters should be shown
   * Only show when there are 2+ different object types
   */
  get showFilters() {
    return this.filters && this.filters.length >= 2;
  }

  /**
   * @description Update pagination state
   */
  updatePagination() {
    if (!this.enablePagination) {
      this.totalPages = 1;
      return;
    }

    const totalRecords = this.filteredRows.length;
    this.totalPages = Math.max(1, Math.ceil(totalRecords / this.recordsPerPage));
    
    // Ensure current page is valid
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  /**
   * @description Get paginated rows
   */
  get paginatedRows() {
    // IMPORTANT: filteredRows should already be sorted by applyFilter()
    // We just slice it for pagination - sorting happens on full dataset
    if (!this.enablePagination) {
      return this.filteredRows;
    }

    const startIndex = (this.currentPage - 1) * this.recordsPerPage;
    const endIndex = startIndex + this.recordsPerPage;
    // Slice the already-sorted filteredRows
    return this.filteredRows.slice(startIndex, endIndex);
  }

  /**
   * @description Get pagination info text (simplified)
   */
  get paginationInfo() {
    if (!this.enablePagination || this.filteredRows.length === 0) {
      return "";
    }
    return `Page ${this.currentPage} of ${this.totalPages}`;
  }

  /**
   * @description Get page numbers to display (modern, clean pagination)
   * Shows: First page, current page ± 2, last page with ellipsis
   * For small datasets, shows all pages
   */
  get pageNumbers() {
    return this.calculatePageNumbers();
  }

  /**
   * @description Calculate page numbers to display for pagination
   * @return {Array} Array of page number objects with metadata
   */
  calculatePageNumbers() {
    if (this.totalPages <= 1) {
      return [];
    }

    // For small datasets (5 or fewer pages), show all
    if (this.totalPages <= 5) {
      return this.createSimplePageNumbers();
    }

    // For larger datasets, use smart pagination
    return this.createSmartPageNumbers();
  }

  /**
   * @description Create simple page numbers for small datasets (5 or fewer pages)
   * @return {Array} Array of page number objects
   */
  createSimplePageNumbers() {
    const pages = [];
    // For small datasets, show all pages but limit to max 5 visible
    const maxVisible = 5;
    const current = this.currentPage;
    const total = this.totalPages;
    
    if (total <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= total; i++) {
        pages.push(this.createPageNumberObject(i, i === current));
      }
    } else {
      // Even for "small" datasets, if > 5 pages, use smart pagination
      return this.createSmartPageNumbers();
    }
    
    return pages;
  }

  /**
   * @description Create smart page numbers for larger datasets (simplified - show only current ± 1)
   * @return {Array} Array of page number objects with ellipsis
   */
  createSmartPageNumbers() {
    const pages = [];
    const current = this.currentPage;
    const total = this.totalPages;
    const showAround = 1; // Show only 1 page before and after current (simpler)

    // Always show first page
    if (total > 1) {
      pages.push(this.createPageNumberObject(1, current === 1));
    }

    // Calculate range around current page
    let startPage = Math.max(2, current - showAround);
    let endPage = Math.min(total - 1, current + showAround);

    // Adjust if we're near the start
    if (current <= showAround + 1) {
      endPage = Math.min(total - 1, 3);
    }

    // Adjust if we're near the end
    if (current >= total - showAround) {
      startPage = Math.max(2, total - 2);
    }

    // Add ellipsis after first page if needed
    if (startPage > 2) {
      pages.push({ number: null, type: "ellipsis-start" });
    }

    // Add pages around current
    for (let i = startPage; i <= endPage; i++) {
      pages.push(this.createPageNumberObject(i, i === current));
    }

    // Add ellipsis before last page if needed
    if (endPage < total - 1) {
      pages.push({ number: null, type: "ellipsis-end" });
    }

    // Always show last page (if not already shown and total > 1)
    if (total > 1 && endPage < total) {
      pages.push(this.createPageNumberObject(total, current === total));
    }

    return pages;
  }

  /**
   * @description Create a page number object with metadata
   * @param {Number} pageNumber - The page number
   * @param {Boolean} isActive - Whether this page is currently active
   * @return {Object} Page number object
   */
  createPageNumberObject(pageNumber, isActive) {
    return {
      number: pageNumber,
      type: "page",
      class: isActive 
        ? HM_ConfigurableList.CSS_CLASSES.PAGINATION_PAGE_ACTIVE 
        : HM_ConfigurableList.CSS_CLASSES.PAGINATION_PAGE,
      ariaLabel: `Go to page ${pageNumber}`
    };
  }

  /**
   * @description Handle page change
   * Note: filteredRows should already be sorted from applyFilter()
   * We just change the page - sorting persists across pages
   */
  handlePageChange(event) {
    const page = parseInt(event.currentTarget.dataset.page, 10);
    if (page && page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      // Scroll to top of table
      this.scrollToTop();
      // No need to re-apply sort - filteredRows is already sorted
    }
  }

  /**
   * @description Handle previous page
   * filteredRows is already sorted - just navigate pages
   */
  handlePreviousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollToTop();
    }
  }

  /**
   * @description Handle next page
   * filteredRows is already sorted - just navigate pages
   */
  handleNextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollToTop();
    }
  }

  /**
   * @description Scroll to top of table
   */
  scrollToTop() {
    // Scroll to the card header
    const card = this.template.querySelector(".cc-card");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * @description Check if previous button should be disabled
   */
  get isPreviousDisabled() {
    return this.currentPage <= 1;
  }

  /**
   * @description Check if next button should be disabled
   */
  get isNextDisabled() {
    return this.currentPage >= this.totalPages;
  }

  /**
   * @description Handle column header click for sorting
   * Toggles sort direction if same column, or sets new column with ascending sort
   * @param {Event} event - Click event with columnKey in dataset
   */
  handleColumnSort(event) {
    if (!this.enableColumnSorting) {
      return;
    }

    const columnKey = event.currentTarget.dataset.columnKey;
    if (!columnKey) {
      return;
    }

    // Toggle sort direction if clicking the same column
    if (this.sortColumn === columnKey) {
      this.sortDirection = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
        ? HM_ConfigurableList.SORT_DIRECTIONS.DESC 
        : HM_ConfigurableList.SORT_DIRECTIONS.ASC;
    } else {
      // New column - start with ascending
      this.sortColumn = columnKey;
      this.sortDirection = HM_ConfigurableList.SORT_DIRECTIONS.ASC;
    }

    // Update column sort state and classes
    this.updateColumnSortState();

    // Apply filter (which will also apply sorting)
    this.applyFilter();
  }

  /**
   * @description Get cell value from row for sorting
   * Handles both regular cells and virtual columns (which may need to be created on-the-fly)
   * @param {Object} row - Row object containing cells array
   * @param {String} columnKey - Key of column to get value from
   * @return {*} Raw cell value, or null if not found
   */
  getCellValue(row, columnKey) {
    // First try to find in existing cells
    const cell = row.cells.find((c) => c && c.key === columnKey);
    if (cell) {
      return cell.rawValue;
    }
    
    // If not found, might be a virtual column - try to get from visibleCells
    if (row.visibleCells) {
      const visibleCell = row.visibleCells.find((c) => c && c.key === columnKey);
      if (visibleCell) {
        return visibleCell.rawValue;
      }
    }
    
    // If still not found and it's a virtual column, get value directly from record
    // Check visibleColumns first (what's actually displayed), then configured columns
    let column = null;
    try {
      // Get visible columns (might include virtual columns)
      const visibleCols = this.visibleColumns;
      column = visibleCols.find(col => col.key === columnKey);
    } catch {
      // Intentional graceful degradation: visibleColumns getter can fail during
      // component initialization or filter changes. Fall back to configured columns
      // rather than breaking the sort operation. This is non-critical for sorting.
      column = null;
    }
    
    if (!column) {
      column = this.columns.find(col => col.key === columnKey);
    }
    
    if (column && row.record) {
      // Handle virtual columns (both smart and regular)
      if (column.isVirtual) {
        // Handle smart Name column
        if (column.isSmartNameColumn) {
          if (row.objectType === 'Case') {
            return this.getFieldValue(row.record, 'CaseNumber');
          }
          return this.getFieldValue(row.record, 'Name');
        }
        // Regular virtual column
        return this.getFieldValue(row.record, column.fieldApiName);
      }
      
      // For regular columns, try to get from record if cell not found
      return this.getFieldValue(row.record, column.fieldApiName);
    }
    
    return null;
  }

  /**
   * @description Sort rows based on column and format type
   * @param {Array} rows - Array of row objects to sort
   * @param {String} columnKey - Key of column to sort by
   * @param {String} direction - Sort direction ('asc' or 'desc')
   * @param {String} formatType - Format type for proper comparison
   * @return {Array} Sorted array of rows (new array, original not modified)
   */
  sortRows(rows, columnKey, direction, formatType) {
    return [...rows].sort((a, b) => {
      const aValue = this.getCellValue(a, columnKey);
      const bValue = this.getCellValue(b, columnKey);
      return this.compareCellValues(aValue, bValue, formatType, direction);
    });
  }

  /**
   * @description Compare two cell values for sorting
   * @param {*} aValue - First value to compare
   * @param {*} bValue - Second value to compare
   * @param {String} formatType - Format type (Currency, Number, Date, Percent, Text)
   * @param {String} direction - Sort direction (asc or desc)
   * @return {Number} Comparison result (-1, 0, or 1)
   */
  compareCellValues(aValue, bValue, formatType, direction) {
    // Handle null/undefined values - sort to end
    if (aValue === null || aValue === undefined) {
      return 1; // a goes to end
    }
    if (bValue === null || bValue === undefined) {
      return -1; // b goes to end
    }

    let comparison = 0;

    switch (formatType) {
      case HM_ConfigurableList.FORMAT_TYPES.CURRENCY:
      case HM_ConfigurableList.FORMAT_TYPES.NUMBER:
        comparison = (Number(aValue) || 0) - (Number(bValue) || 0);
        break;
      case HM_ConfigurableList.FORMAT_TYPES.DATE: {
        const aDate = new Date(aValue);
        const bDate = new Date(bValue);
        comparison = aDate.getTime() - bDate.getTime();
        break;
      }
      case HM_ConfigurableList.FORMAT_TYPES.PERCENT:
        comparison = (Number(aValue) || 0) - (Number(bValue) || 0);
        break;
      default: // Text
        comparison = String(aValue || "")
          .toLowerCase()
          .localeCompare(String(bValue || "").toLowerCase());
    }

    return direction === HM_ConfigurableList.SORT_DIRECTIONS.ASC ? comparison : -comparison;
  }

  /**
   * @description Compute CSS class for column header based on sort state
   * @param {Object} column - Column definition object
   * @return {String} CSS class string for header
   */
  computeColumnHeaderClass(column) {
    let classes = HM_ConfigurableList.CSS_CLASSES.COL_DATA;
    if (column.sortable) {
      classes += " " + HM_ConfigurableList.CSS_CLASSES.COL_SORTABLE;
    }
    if (column.sortDirection) {
      classes += " " + HM_ConfigurableList.CSS_CLASSES.COL_SORTED;
    }
    return classes;
  }

  /**
   * @description Update column sort state and classes
   * Updates both configured columns and virtual columns (from visibleColumns)
   */
  updateColumnSortState() {
    // Compute visibleColumns once before loops to avoid multiple getter calls
    const visibleCols = this.visibleColumns;

    // Update configured columns
    this.columns.forEach((col) => {
      if (col.key === this.sortColumn) {
        col.sortDirection = this.sortDirection;
        col.sortIcon = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
          ? HM_ConfigurableList.SORT_ICONS.ASC 
          : HM_ConfigurableList.SORT_ICONS.DESC;
        col.sortAlternativeText = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
          ? "Sorted ascending" 
          : "Sorted descending";
        col.ariaSort = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
          ? "ascending" 
          : "descending";
      } else {
        col.sortDirection = null;
        col.sortIcon = null;
        col.sortAlternativeText = "";
        col.ariaSort = col.sortable ? "none" : null;
      }
      col.headerClass = this.computeColumnHeaderClass(col);
      // Title doesn't need to change, but ensure it's set
      col.title = col.sortable ? "Click to sort" : "";
    });
    
    // Update virtual columns (from visibleColumns) - these are not in this.columns
    visibleCols.forEach((col) => {
      if (col.isVirtual) {
        if (col.key === this.sortColumn) {
          col.sortDirection = this.sortDirection;
          col.sortIcon = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
            ? HM_ConfigurableList.SORT_ICONS.ASC 
            : HM_ConfigurableList.SORT_ICONS.DESC;
          col.sortAlternativeText = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
            ? "Sorted ascending" 
            : "Sorted descending";
          col.ariaSort = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
            ? "ascending" 
            : "descending";
        } else {
          col.sortDirection = null;
          col.sortIcon = null;
          col.sortAlternativeText = "";
          col.ariaSort = col.sortable ? "none" : null;
        }
        col.headerClass = this.computeColumnHeaderClass(col);
        col.title = col.sortable ? "Click to sort" : "";
      }
    });
  }

  /**
   * @description Get container class
   */
  get containerClass() {
    return this.isDarkMode 
      ? HM_ConfigurableList.CSS_CLASSES.CONTAINER_DARK 
      : HM_ConfigurableList.CSS_CLASSES.CONTAINER;
  }
}