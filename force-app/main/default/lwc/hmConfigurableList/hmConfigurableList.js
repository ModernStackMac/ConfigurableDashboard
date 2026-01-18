import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getComponentConfiguration from "@salesforce/apex/HM_DashboardConfigService.getComponentConfiguration";
import executeComponentQuery from "@salesforce/apex/HM_ComponentDataService.executeComponentQuery";

/**
 * @description Clean, simplified configurable list component
 * Displays tabular data from SOQL queries or Apex methods
 * Supports object-specific columns and row icons
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

  // Wired result for refresh
  wiredConfigResult;

  /**
   * @description Wire component configuration
   */
  @wire(getComponentConfiguration, { componentId: "$componentId" })
  wiredConfig(result) {
    this.wiredConfigResult = result;
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
      // Note: activeFilter will be set in buildFilters() when data loads
      this.loadData();
    } else if (error) {
      this.errorMessage = this.extractErrorMessage(error);
      this.isLoading = false;
    }
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
  }

  /**
   * @description Load data from Apex
   */
  async loadData() {
    // Input validation
    if (!this.componentConfig || !this.componentId) {
      this.isLoading = false;
      return;
    }

    if (!this.componentId || typeof this.componentId !== 'string') {
      this.errorMessage = 'Invalid component ID';
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const data = await executeComponentQuery({
        componentId: this.componentId,
        context: {}
      });

      this.rows = this.formatRows(data || []);
      this.buildFilters();
      this.applyFilter();
      this.updatePagination();
    } catch (error) {
      this.errorMessage = this.extractErrorMessage(error);
      const defaultData = this.getDefaultListData();
      this.rows = defaultData.rows;
      this.filteredRows = defaultData.filteredRows;
      this.filters = defaultData.filters;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * @description Format raw data into rows with cells
   */
  formatRows(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return data.map((record, index) => {
      const recordId = record.Id || record.recordId || `row-${index}`;
      const objectType = this.getObjectType(record);
      const rowIcon = this.getRowIcon(objectType);

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

    // Get field value and format it
    const value = this.getFieldValue(record, column.fieldApiName);
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
      } catch (error) {
        // If badge calculation fails, silently fail and don't show badge
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
    } catch (error) {
      // If calculation fails, return null (no badge)
      return null;
    }
  }

  /**
   * @description Get object type from record
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
   * @description Get row icon based on object type
   * Supports case-insensitive lookup and default icon fallback
   * @param {String} objectType Object type to get icon for
   * @return {String|null} Icon name or null if no match
   */
  getRowIcon(objectType) {
    if (!this.componentConfig?.rowIconConfiguration || !objectType) {
      return null;
    }

    const iconConfig = this.componentConfig.rowIconConfiguration;
    
    if (!iconConfig || typeof iconConfig !== 'object') {
      return null;
    }
    
    // Try exact match first
    if (iconConfig[objectType] && iconConfig[objectType].trim().length > 0) {
      return iconConfig[objectType];
    }
    
    // Try case-insensitive match
    const objectTypeLower = objectType.toLowerCase();
    for (const key in iconConfig) {
      if (key.toLowerCase() === objectTypeLower) {
        const iconName = iconConfig[key];
        if (iconName && iconName.trim().length > 0) {
          return iconName;
        }
      }
    }
    
    // Try default icon (key: "*" or "default")
    const defaultIcon = iconConfig['*'] || iconConfig['default'];
    if (defaultIcon && defaultIcon.trim().length > 0) {
      return defaultIcon;
    }
    
    return null;
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
   * @description Get cell for a specific column from a row
   */
  getCellForColumn(row, column) {
    if (!row || !row.cells || !column) {
      return null;
    }
    return row.cells.find((cell) => cell && cell.key === column.key) || null;
  }

  /**
   * @description Find cell for a column in a row using unique detail map ID key
   * @param {Object} row - The row object containing cells
   * @param {Object} column - The column definition (key is detail map ID)
   * @return {Object} Cell object or placeholder if not found
   */
  findCellForColumn(row, column) {
    if (!row || !row.cells || !column) {
      return {
        key: column?.key || '',
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
   * Only shows columns that apply to the currently selected object type
   */
  get visibleColumns() {
    if (!this.activeFilter) {
      // If no filter is active, determine object type from configuration or data
      const inferredObjectType = this.inferObjectType();
      
      if (inferredObjectType) {
        // Filter columns to only show those that apply to the inferred object type
        return this.columns.filter((column) =>
          this.columnAppliesToObject(column, inferredObjectType)
        );
      }
      
      // If we can't infer object type, show only columns with no objectType restriction
      // (columns that apply to all object types)
      return this.columns.filter((column) =>
        !column.objectType || column.objectType.length === 0
      );
    }

    // Filter columns to only show those that apply to the active filter's object type
    return this.columns.filter((column) =>
      this.columnAppliesToObject(column, this.activeFilter)
    );
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
   * @description Get field value from record (supports nested fields)
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
   * @description Format currency value
   * @param {*} value - Numeric value to format
   * @return {String} Formatted currency string (e.g., $1.5M, $5K, $100)
   */
  formatCurrency(value) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  }

  /**
   * @description Format number value
   * @param {*} value - Numeric value to format
   * @return {String} Formatted number string with locale formatting
   */
  formatNumber(value) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString();
  }

  /**
   * @description Format percent value
   * @param {*} value - Numeric value to format (0.5 = 50%)
   * @return {String} Formatted percent string
   */
  formatPercent(value) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return `${(num * 100).toFixed(1)}%`;
  }

  /**
   * @description Format date value
   * @param {*} value - Date value to format
   * @return {String} Formatted date string
   */
  formatDate(value) {
    if (!value) return "";
    
    // Handle Date objects
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return "";
      return value.toLocaleDateString();
    }
    
    // Handle string dates from Salesforce
    if (typeof value === "string") {
      // Try parsing directly
      let date = new Date(value);
      
      // If that fails, try parsing as YYYY-MM-DD format (Salesforce Date format)
      if (isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const dateOnly = value.substring(0, 10);
        date = new Date(dateOnly + "T00:00:00");
      }
      
      // If still invalid, try parsing as timestamp
      if (isNaN(date.getTime()) && /^\d+$/.test(value)) {
        date = new Date(parseInt(value, 10));
      }
      
      if (isNaN(date.getTime())) {
        // If all parsing fails, return the original string
        return value;
      }
      
      return date.toLocaleDateString();
    }
    
    // Handle numbers (timestamps)
    if (typeof value === "number") {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString();
    }
    
    return String(value);
  }

  /**
   * @description Extract error message from error object
   */
  extractErrorMessage(error) {
    if (!error) return "Unknown error";
    if (error.body?.message) return error.body.message;
    if (error.message) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error occurred";
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
   * Only creates filters for object types (no "All" option)
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

    // Build filter array (no "All" option)
    this.filters = [];

    // Sort object types alphabetically
    const sortedObjectTypes = objectTypes.sort();
    
    // Set first filter as active if no filter is currently active
    if (this.activeFilter === null && sortedObjectTypes.length > 0) {
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
   */
  applyFilter() {
    // Filter rows by object type (if filter is active)
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
      const column = this.columns.find((col) => col.key === this.sortColumn);
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
   */
  getCellValue(row, columnKey) {
    const cell = row.cells.find((c) => c && c.key === columnKey);
    if (!cell) {
      return null;
    }
    // Use rawValue for sorting (not formatted value)
    return cell.rawValue;
  }

  /**
   * @description Sort rows based on column and format type
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
   * @description Compute column header class
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
   */
  updateColumnSortState() {
    this.columns.forEach((col) => {
      if (col.key === this.sortColumn) {
        col.sortDirection = this.sortDirection;
        col.sortIcon = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
          ? HM_ConfigurableList.SORT_ICONS.ASC 
          : HM_ConfigurableList.SORT_ICONS.DESC;
        col.sortAlternativeText = this.sortDirection === HM_ConfigurableList.SORT_DIRECTIONS.ASC 
          ? "Sorted ascending" 
          : "Sorted descending";
      } else {
        col.sortDirection = null;
        col.sortIcon = null;
        col.sortAlternativeText = "";
      }
      col.headerClass = this.computeColumnHeaderClass(col);
      // Title doesn't need to change, but ensure it's set
      col.title = col.sortable ? "Click to sort" : "";
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