import { api, track, wire, LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import COMPONENT_TYPE_FIELD from "@salesforce/schema/HM_Dashboard_Component__c.HM_Type__c";
import loadDataSource from "@salesforce/apex/HM_DataSourceBuilderService.loadDataSource";
import saveDataSourceComplete from "@salesforce/apex/HM_DataSourceBuilderService.saveDataSourceComplete";
import getAccessibleObjects from "@salesforce/apex/HM_DataSourceBuilderService.getAccessibleObjects";
import getObjectFields from "@salesforce/apex/HM_DataSourceBuilderService.getObjectFields";
import getRelatedObjectFields from "@salesforce/apex/HM_DataSourceBuilderService.getRelatedObjectFields";
import executePreviewQuery from "@salesforce/apex/HM_DataSourceBuilderService.executePreviewQuery";

/**
 * @description Data Source Query Builder - Single-page layout for creating/editing Data Sources
 * Provides a visual interface for building SOQL queries without writing code.
 * 
 * Key capabilities:
 * - Object and field selection with search/filter
 * - List mode (SELECT fields) and Aggregate mode (COUNT, SUM, AVG, etc.)
 * - WHERE clause builder with field-type-aware operators
 * - Quick filters for owner (My Records, Queue Records)
 * - Real-time SOQL preview with syntax highlighting
 * - Query preview execution (limited to 5 rows)
 * - Serialization/deserialization for saving query state
 * 
 * Security: All user inputs are escaped before SOQL construction
 * 
 * @author High Meadows
 * @date 2024
 */
export default class HM_DataSourceQueryBuilder extends LightningElement {
  // ==================== STATIC DEFINITIONS ====================

  static OPERATORS = {
    STRING: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "contains", value: "contains" },
      { label: "starts with", value: "starts_with" },
      { label: "ends with", value: "ends_with" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    TEXTAREA: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "contains", value: "contains" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    PICKLIST: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    MULTIPICKLIST: [
      { label: "includes", value: "includes" },
      { label: "excludes", value: "excludes" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    NUMBER: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "less than", value: "less_than" },
      { label: "greater than", value: "greater_than" },
      { label: "less or equal", value: "less_or_equal" },
      { label: "greater or equal", value: "greater_or_equal" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    DATE: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "less than", value: "less_than" },
      { label: "greater than", value: "greater_than" },
      { label: "less or equal", value: "less_or_equal" },
      { label: "greater or equal", value: "greater_or_equal" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" },
      { label: "= TODAY", value: "date_today" },
      { label: "> TODAY", value: "date_gt_today" },
      { label: "< TODAY", value: "date_lt_today" },
      { label: "= THIS_WEEK", value: "date_this_week" },
      { label: "= THIS_MONTH", value: "date_this_month" },
      { label: "= THIS_YEAR", value: "date_this_year" },
      { label: "= LAST_N_DAYS:n", value: "date_last_n_days" },
      { label: "> LAST_N_DAYS:n", value: "date_gt_last_n_days" },
      { label: "= NEXT_N_DAYS:n", value: "date_next_n_days" },
      { label: "< NEXT_N_DAYS:n", value: "date_lt_next_n_days" }
    ],
    BOOLEAN: [
      { label: "equals", value: "equals" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ],
    ID: [
      { label: "equals", value: "equals" },
      { label: "not equals", value: "not_equals" },
      { label: "is null", value: "is_null" },
      { label: "is not null", value: "is_not_null" }
    ]
  };

  static FIELD_TYPE_MAP = {
    STRING: "STRING",
    TEXTAREA: "TEXTAREA",
    EMAIL: "STRING",
    PHONE: "STRING",
    URL: "STRING",
    PICKLIST: "PICKLIST",
    MULTIPICKLIST: "MULTIPICKLIST",
    INTEGER: "NUMBER",
    DOUBLE: "NUMBER",
    CURRENCY: "NUMBER",
    PERCENT: "NUMBER",
    DATE: "DATE",
    DATETIME: "DATE",
    TIME: "STRING",
    BOOLEAN: "BOOLEAN",
    ID: "ID",
    REFERENCE: "ID"
  };

  static AGGREGATE_FUNCTIONS = [
    { label: "COUNT", value: "COUNT", requiresField: false, fieldTypes: null },
    { label: "COUNT_DISTINCT", value: "COUNT_DISTINCT", requiresField: true, fieldTypes: null },
    { label: "SUM", value: "SUM", requiresField: true, fieldTypes: ["DOUBLE", "INTEGER", "CURRENCY", "PERCENT"] },
    { label: "AVG", value: "AVG", requiresField: true, fieldTypes: ["DOUBLE", "INTEGER", "CURRENCY", "PERCENT"] },
    { label: "MIN", value: "MIN", requiresField: true, fieldTypes: null },
    { label: "MAX", value: "MAX", requiresField: true, fieldTypes: null }
  ];

  // ==================== PUBLIC PROPERTIES ====================
  @api recordId; // Record ID for editing existing records (null for new records)

  // ==================== BASIC INFO STATE ====================
  @track formData = {
    name: "",
    active: true,
    dashboardComponentId: null,
    order: 1,
    rowIconName: ""
  };

  componentType = null;
  isIconNameConfirmed = false; // True after user blurs the icon name input

  // ==================== QUERY SETUP STATE ====================
  @track page2Data = {
    selectedObjectApiName: null,
    selectedObjectLabel: null
  };

  // Query type state (List or Aggregate)
  queryType = "List"; // 'List' | 'Aggregate'

  // Aggregate mode state
  aggregateFunction = null; // 'COUNT' | 'COUNT_DISTINCT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
  aggregateFieldApiName = null; // Single field for aggregate target

  // Aggregate field search state
  aggregateFieldSearchTerm = "";
  @track filteredAggregateFields = [];
  isAggregateFieldListOpen = false;
  aggregateFieldHighlightedIndex = -1;

  // Object search state
  allObjects = [];
  @track filteredObjects = [];
  objectSearchTerm = "";
  isObjectListOpen = false;
  isLoadingObjects = false;
  highlightedIndex = -1;

  // Field selection state
  allFields = [];
  @track selectedFieldApiNames = [];
  isLoadingFields = false;
  fieldCache = {};
  fieldSearchTerm = "";

  // Relationship field expansion state - tracks which lookup fields are expanded
  // Structure: { fieldApiName: { expanded: boolean, loading: boolean, children: [] } }
  @track expandedFields = {};

  // ==================== FILTERS STATE ====================
  @track whereConditions = [];
  conditionIdCounter = 0;
  
  // Owner filter state (mutually exclusive: 'me' | 'queue' | null)
  activeOwnerFilter = null;
  
  // Field search state per condition
  @track openFieldListConditionId = null;
  
  // Query limit (null means no limit)
  queryLimit = null;

  // ==================== PREVIEW RESULTS STATE ====================
  @track queryResults = [];
  @track queryColumns = [];
  queryTotalCount = 0;
  isQueryLoading = false;
  queryError = null;

  // ==================== COMMON STATE ====================
  isLoading = false;
  isSaving = false;
  
  // Accordion section state - tracked to preserve user's manual open/close actions
  // All sections open by default (sections not yet rendered are ignored by the accordion)
  @track openSections = ["settings", "query", "fields", "aggregate", "filters", "preview"];
  error = null;

  // Timeout IDs for cleanup on disconnect (Set for O(1) add/delete)
  _pendingTimeouts = new Set();
  
  // Auto-refresh debounce timer
  _autoRefreshTimeoutId = null;

  // ==================== WIRE ADAPTERS ====================

  /**
   * @description Wire adapter to fetch Dashboard Component type when component is selected
   */
  @wire(getRecord, {
    recordId: "$formData.dashboardComponentId",
    fields: [COMPONENT_TYPE_FIELD]
  })
  wiredDashboardComponent({ error, data }) {
    if (data) {
      this.componentType = getFieldValue(data, COMPONENT_TYPE_FIELD);
    } else if (error) {
      this.componentType = null;
    }
  }

  // ==================== LIFECYCLE HOOKS ====================

  connectedCallback() {
    // Load objects for Step 1 (object selection is now on Step 1)
    this.loadObjects();
    
    // Load existing data if recordId is provided (for editing)
    if (this.recordId) {
      this.loadExistingData();
    }
  }

  disconnectedCallback() {
    // Clear any pending blur timeouts to prevent memory leaks
    this._pendingTimeouts.forEach((id) => clearTimeout(id));
    this._pendingTimeouts.clear();
    
    // Clear auto-refresh timeout
    if (this._autoRefreshTimeoutId) {
      clearTimeout(this._autoRefreshTimeoutId);
      this._autoRefreshTimeoutId = null;
    }
  }

  // ==================== ACCORDION HANDLERS ====================

  /**
   * @description Handle accordion section toggle events
   * Preserves user's manual open/close actions by storing state in tracked property
   * @param {Event} event - Section toggle event with detail.openSections
   */
  handleSectionToggle(event) {
    this.openSections = event.detail.openSections;
  }

  // ==================== FORM HANDLERS ====================

  /**
   * @description Handle Data Source Name input change
   * @param {Event} event - Input change event
   */
  handleNameChange(event) {
    this.formData.name = event.target.value || "";
    this.clearError();
  }

  /**
   * @description Handle Active toggle change
   * @param {Event} event - Toggle change event
   */
  handleActiveChange(event) {
    this.formData.active = event.target.checked;
  }

  /**
   * @description Handle Dashboard Component record picker change
   * @param {Event} event - Record picker change event
   */
  handleDashboardComponentChange(event) {
    this.formData.dashboardComponentId = event.detail.recordId || null;
    // Reset row icon when component changes (componentType updated by wire adapter)
    this.formData.rowIconName = "";
    this.clearError();
  }

  /**
   * @description Handle Order input change
   * @param {Event} event - Input change event
   */
  handleOrderChange(event) {
    this.formData.order = event.target.value ? parseInt(event.target.value, 10) : 1;
  }

  /**
   * @description Handle Row Icon Name input change
   * @param {Event} event - Input change event
   */
  handleRowIconNameChange(event) {
    this.formData.rowIconName = event.target.value || "";
    // Reset confirmation when user types
    this.isIconNameConfirmed = false;
  }

  /**
   * @description Handle Row Icon Name input blur - confirms the icon preview
   */
  handleRowIconNameBlur() {
    this.isIconNameConfirmed = true;
  }

  // ==================== ACTION HANDLERS ====================

  /**
   * @description Handle Cancel button click
   */
  handleCancel() {
    this.closePanel();
  }


  /**
   * @description Handle Copy SOQL button click - copies SOQL to clipboard
   */
  handleCopySoql() {
    if (this.generatedSoql) {
      navigator.clipboard.writeText(this.generatedSoql).then(() => {
        this.showToast("Copied", "SOQL copied to clipboard", "success");
      }).catch(() => {
        this.showError("Error", "Failed to copy SOQL to clipboard");
      });
    }
  }

  /**
   * @description Handle Save button click - saves all data
   */
  async handleSave() {
    // Validate form before saving
    if (!this.isFormValid) {
      this.showError("Validation Error", "Please complete all required fields and fix any invalid conditions");
      return;
    }

    this.isSaving = true;
    this.clearError();

    try {
      // Save complete wizard data (all pages) - returns the record ID
      const savedRecordId = await saveDataSourceComplete({
        recordId: this.recordId || null,
        name: this.formData.name.trim(),
        active: this.formData.active,
        dashboardComponentId: this.formData.dashboardComponentId,
        orderValue: this.formData.order,
        rowIconName: this.formData.rowIconName?.trim() || null,
        returnType: this.queryType,
        soqlQuery: this.generatedSoql,
        queryConfig: this.serializeQueryConfig()
      });

      this.showToast("Success", "Data Source saved successfully", "success");
      
      // Dispatch savesuccess event with record ID for navigation
      this.dispatchEvent(new CustomEvent("savesuccess", {
        detail: { recordId: savedRecordId }
      }));
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error saving data source";
      this.showError("Error", errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * @description Load all accessible objects for Page 2
   */
  async loadObjects() {
    if (this.allObjects.length > 0) {
      // Already loaded, just filter
      this.filterObjects();
      return;
    }

    this.isLoadingObjects = true;

    try {
      const objects = await getAccessibleObjects();
      this.allObjects = objects;
      this.filterObjects();
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error loading objects";
      this.showError("Error", errorMessage);
    } finally {
      this.isLoadingObjects = false;
    }
  }

  /**
   * @description Load fields for selected object
   * @param {string} objectApiName - API name of object to load fields for
   */
  async loadFieldsForObject(objectApiName) {
    if (!objectApiName) {
      return;
    }

    // Check cache first
    if (this.fieldCache[objectApiName]) {
      this.allFields = this.fieldCache[objectApiName];
      this.selectedFieldApiNames = [];
      this.fieldSearchTerm = "";
      this.updateSoqlPreview();
      return;
    }

    this.isLoadingFields = true;

    try {
      const fields = await getObjectFields({ objectApiName });
      this.fieldCache[objectApiName] = fields;
      this.allFields = fields;
      this.selectedFieldApiNames = [];
      this.fieldSearchTerm = "";
      this.updateSoqlPreview();
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error loading fields";
      this.showError("Error", errorMessage);
    } finally {
      this.isLoadingFields = false;
    }
  }

  // ==================== OBJECT SEARCH HANDLERS ====================

  /**
   * @description Handle object search input
   * @param {Event} event - Input event
   */
  handleObjectSearchInput(event) {
    this.objectSearchTerm = event.target.value;
    this.filterObjects();
    this.isObjectListOpen = true;
    this.highlightedIndex = -1;
  }

  /**
   * @description Handle object selection from dropdown
   * @param {Event} event - Click event
   */
  handleObjectSelect(event) {
    const apiName = event.currentTarget.dataset.value;
    const obj = this.allObjects.find((o) => o.apiName === apiName);
    if (obj) {
      this.page2Data.selectedObjectApiName = obj.apiName;
      this.page2Data.selectedObjectLabel = obj.label;
      this.objectSearchTerm = obj.label;
      this.isObjectListOpen = false;
      this.highlightedIndex = -1;

      // Reset all field/aggregate state when object changes
      this.selectedFieldApiNames = [];
      this.fieldSearchTerm = "";
      this.expandedFields = {};
      this.aggregateFunction = null;
      this.aggregateFieldApiName = null;
      this.aggregateFieldSearchTerm = "";

      // Clear preview results when object changes
      this.clearPreviewResults();

      // Load fields for selected object
      this.loadFieldsForObject(obj.apiName);

      // Expand new sections that become available, preserving user's existing section state
      this.expandNewSectionsForObject();
    }
  }

  /**
   * @description Expand accordion sections when object is selected
   * Uses setTimeout to ensure DOM has rendered the new sections before opening them
   */
  expandNewSectionsForObject() {
    // Use setTimeout to defer until after LWC's rendering cycle completes
    // This ensures the accordion sections exist in DOM before we try to open them
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      const sectionsToOpen = [...this.openSections];
      
      // Add the appropriate mode section (fields for List, aggregate for Aggregate)
      if (this.isListMode && !sectionsToOpen.includes("fields")) {
        sectionsToOpen.push("fields");
      }
      if (!this.isListMode && !sectionsToOpen.includes("aggregate")) {
        sectionsToOpen.push("aggregate");
      }
      
      // Always add filters section if not already open
      if (!sectionsToOpen.includes("filters")) {
        sectionsToOpen.push("filters");
      }

      // Always add preview section if not already open
      if (!sectionsToOpen.includes("preview")) {
        sectionsToOpen.push("preview");
      }
      
      // Force accordion to recognize new sections by setting a new array reference
      this.openSections = sectionsToOpen;
    }, 0);
  }

  /**
   * @description Handle field search input change
   * @param {Event} event - Input change event
   */
  handleFieldSearchChange(event) {
    this.fieldSearchTerm = event.target.value || "";
  }

  /**
   * @description Handle field checkbox toggle
   * @param {Event} event - Checkbox change event
   */
  handleFieldCheckboxChange(event) {
    const apiName = event.target.dataset.apiName;
    const isChecked = event.target.checked;

    if (isChecked) {
      this.selectedFieldApiNames = [...this.selectedFieldApiNames, apiName];
    } else {
      this.selectedFieldApiNames = this.selectedFieldApiNames.filter((f) => f !== apiName);
    }

    this.updateSoqlPreview();
  }

  /**
   * @description Toggle expansion of a relationship field and lazy-load children
   * @param {Event} event - Click event from chevron
   */
  async handleFieldExpand(event) {
    event.stopPropagation();
    const fieldApiName = event.currentTarget.dataset.apiName;
    const currentState = this.expandedFields[fieldApiName] || {};

    if (currentState.expanded) {
      // Collapse
      this.expandedFields = {
        ...this.expandedFields,
        [fieldApiName]: { ...currentState, expanded: false }
      };
    } else {
      // Expand - load children if not already loaded
      if (!currentState.children) {
        this.expandedFields = {
          ...this.expandedFields,
          [fieldApiName]: { ...currentState, expanded: true, loading: true }
        };

        try {
          const children = await getRelatedObjectFields({
            baseObjectApiName: this.page2Data.selectedObjectApiName,
            relationshipFieldApiName: fieldApiName
          });
          this.expandedFields = {
            ...this.expandedFields,
            [fieldApiName]: { expanded: true, loading: false, children }
          };
        } catch (error) {
          this.showError("Error", `Failed to load related fields: ${error.body?.message || error.message}`);
          this.expandedFields = {
            ...this.expandedFields,
            [fieldApiName]: { expanded: false, loading: false, children: [] }
          };
        }
      } else {
        // Already have children, just expand
        this.expandedFields = {
          ...this.expandedFields,
          [fieldApiName]: { ...currentState, expanded: true }
        };
      }
    }
  }

  /**
   * @description Get the parent (lookup) field API name from a relationship field path
   * @param {string} fieldPath - Relationship field path, e.g., "PrimaryPerson.Name"
   * @returns {string|null} Parent field API name or null if not found
   */
  getParentFieldApiName(fieldPath) {
    const relationshipName = fieldPath.split(".")[0];
    const parentField = this.allFields.find((f) => f.relationshipName === relationshipName);
    return parentField?.apiName || null;
  }

  /**
   * @description Auto-expand lookup fields that have selected relationship children
   * Called during edit mode to restore expanded state for selected relationship fields
   */
  async autoExpandFieldsWithSelectedChildren() {
    const relationshipFields = this.selectedFieldApiNames.filter((f) => f.includes("."));
    if (relationshipFields.length === 0) {
      return;
    }

    // Group relationship fields by their parent lookup field
    const parentFieldsToExpand = new Set();
    for (const relField of relationshipFields) {
      const parentApiName = this.getParentFieldApiName(relField);
      if (parentApiName) {
        parentFieldsToExpand.add(parentApiName);
      }
    }

    // Mark all parent fields as loading first
    const fieldsArray = Array.from(parentFieldsToExpand);
    for (const parentApiName of fieldsArray) {
      if (!this.expandedFields[parentApiName]?.expanded) {
        this.expandedFields = {
          ...this.expandedFields,
          [parentApiName]: { expanded: true, loading: true, children: null }
        };
      }
    }

    // Load all children in parallel
    const loadPromises = fieldsArray.map(async (parentApiName) => {
      try {
        const children = await getRelatedObjectFields({
          baseObjectApiName: this.page2Data.selectedObjectApiName,
          relationshipFieldApiName: parentApiName
        });
        return { parentApiName, children, success: true };
      } catch {
        return { parentApiName, children: [], success: false };
      }
    });

    const results = await Promise.all(loadPromises);

    // Update state with results
    for (const result of results) {
      this.expandedFields = {
        ...this.expandedFields,
        [result.parentApiName]: {
          expanded: result.success,
          loading: false,
          children: result.children
        }
      };
    }
  }

  // ==================== QUERY TYPE HANDLERS ====================

  /**
   * @description Handle query type toggle change
   * @param {Event} event - Click event from button
   */
  handleQueryTypeChange(event) {
    const newType = event.target.dataset.value;
    if (newType === this.queryType) return;

    this.queryType = newType;

    // Reset mode-specific state when switching
    if (newType === "List") {
      this.aggregateFunction = null;
      this.aggregateFieldApiName = null;
      this.aggregateFieldSearchTerm = "";
    } else {
      this.selectedFieldApiNames = [];
    }

    // Swap accordion sections: remove old mode section, add new mode section
    this.swapModeSection(newType);

    this.updateSoqlPreview();
  }

  /**
   * @description Swap accordion section when query type changes
   * Removes the old mode section (fields/aggregate) and adds the new one
   * @param {String} newType - The new query type ('List' or 'Aggregate')
   */
  swapModeSection(newType) {
    // Remove both mode-specific sections, then add the appropriate one
    const newSections = this.openSections.filter(s => s !== "fields" && s !== "aggregate");
    
    if (newType === "List") {
      newSections.push("fields");
    } else {
      newSections.push("aggregate");
    }
    
    this.openSections = newSections;
  }

  /**
   * @description Handle aggregate function selection change
   * @param {Event} event - Combobox change event
   */
  handleAggregateFunctionChange(event) {
    this.aggregateFunction = event.detail.value;
    // Reset field when function changes (field requirements may differ)
    this.aggregateFieldApiName = null;
    this.aggregateFieldSearchTerm = "";
    this.filteredAggregateFields = [];
    this.filterAggregateFields();
    this.updateSoqlPreview();
  }

  // ==================== AGGREGATE FIELD SEARCH HANDLERS ====================

  /**
   * @description Filter aggregate fields based on search term and function type
   */
  filterAggregateFields() {
    const func = this.getSelectedAggregateFunction();
    if (!func) {
      this.filteredAggregateFields = [];
      return;
    }

    // First filter by field type based on function
    let availableFields = this.allFields.filter((f) => {
      if (!func.fieldTypes) return true;
      return func.fieldTypes.includes(f.type);
    });

    // Then filter by search term
    const searchLower = this.aggregateFieldSearchTerm.toLowerCase();
    if (searchLower) {
      availableFields = availableFields.filter(
        (f) =>
          f.label.toLowerCase().includes(searchLower) ||
          f.apiName.toLowerCase().includes(searchLower)
      );
    }

    // Map to display format with highlight class
    this.filteredAggregateFields = availableFields.slice(0, 100).map((f, index) => ({
      ...f,
      displayLabel: `${f.label} (${f.apiName})`,
      itemClass:
        index === this.aggregateFieldHighlightedIndex
          ? "slds-media slds-listbox__option slds-listbox__option_plain slds-media_small slds-is-selected"
          : "slds-media slds-listbox__option slds-listbox__option_plain slds-media_small"
    }));
  }

  /**
   * @description Handle aggregate field search input
   * @param {Event} event - Input event
   */
  handleAggregateFieldSearchInput(event) {
    this.aggregateFieldSearchTerm = event.target.value;
    this.aggregateFieldHighlightedIndex = -1;
    this.filterAggregateFields();
  }

  /**
   * @description Handle aggregate field focus
   */
  handleAggregateFieldFocus() {
    this.isAggregateFieldListOpen = true;
    this.filterAggregateFields();
  }

  /**
   * @description Handle aggregate field blur
   */
  handleAggregateFieldBlur() {
    // Delay to allow click to register
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    const timeoutId = setTimeout(() => {
      this.isAggregateFieldListOpen = false;
      this.aggregateFieldHighlightedIndex = -1;
      this._pendingTimeouts.delete(timeoutId);
    }, 200);
    this._pendingTimeouts.add(timeoutId);
  }

  /**
   * @description Handle aggregate field selection
   * @param {Event} event - Click event
   */
  handleAggregateFieldSelect(event) {
    const apiName = event.currentTarget.dataset.value;
    const field = this.allFields.find((f) => f.apiName === apiName);
    if (field) {
      this.aggregateFieldApiName = field.apiName;
      this.aggregateFieldSearchTerm = field.label;
      this.isAggregateFieldListOpen = false;
      this.aggregateFieldHighlightedIndex = -1;
      this.updateSoqlPreview();
    }
  }

  /**
   * @description Clear aggregate field selection
   */
  handleAggregateFieldClear() {
    this.aggregateFieldApiName = null;
    this.aggregateFieldSearchTerm = "";
    this.isAggregateFieldListOpen = false;
    this.aggregateFieldHighlightedIndex = -1;
    this.filterAggregateFields();
    this.updateSoqlPreview();
  }

  /**
   * @description Handle keyboard navigation for aggregate field
   * @param {Event} event - Keydown event
   */
  handleAggregateFieldKeydown(event) {
    if (!this.isAggregateFieldListOpen && event.key !== "ArrowDown") {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.isAggregateFieldListOpen = true;
        if (this.aggregateFieldHighlightedIndex < this.filteredAggregateFields.length - 1) {
          this.aggregateFieldHighlightedIndex++;
          this.filterAggregateFields();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (this.aggregateFieldHighlightedIndex > 0) {
          this.aggregateFieldHighlightedIndex--;
          this.filterAggregateFields();
        }
        break;
      case "Enter":
        event.preventDefault();
        if (this.aggregateFieldHighlightedIndex >= 0 && this.aggregateFieldHighlightedIndex < this.filteredAggregateFields.length) {
          const field = this.filteredAggregateFields[this.aggregateFieldHighlightedIndex];
          this.aggregateFieldApiName = field.apiName;
          this.aggregateFieldSearchTerm = field.label;
          this.isAggregateFieldListOpen = false;
          this.aggregateFieldHighlightedIndex = -1;
          this.updateSoqlPreview();
        }
        break;
      case "Escape":
        event.preventDefault();
        this.isAggregateFieldListOpen = false;
        this.aggregateFieldHighlightedIndex = -1;
        break;
      default:
        break;
    }
  }

  /**
   * @description Clear object selection
   */
  handleObjectClear() {
    this.page2Data.selectedObjectApiName = null;
    this.page2Data.selectedObjectLabel = null;
    this.objectSearchTerm = "";
    this.isObjectListOpen = false;
    this.highlightedIndex = -1;
    this.filterObjects();
    // Reset field selection, expand state, and aggregate state
    this.allFields = [];
    this.selectedFieldApiNames = [];
    this.fieldSearchTerm = "";
    this.expandedFields = {};
    this.aggregateFunction = null;
    this.aggregateFieldApiName = null;
    this.aggregateFieldSearchTerm = "";
    // Clear preview results
    this.clearPreviewResults();
    this.updateSoqlPreview();
  }

  /**
   * @description Handle focus on object search input
   */
  handleObjectFocus() {
    this.isObjectListOpen = true;
    this.filterObjects();
  }

  /**
   * @description Handle blur on object search input
   * @param {Event} event - Blur event
   */
  handleObjectBlur() {
    // Delay closing to allow click events on dropdown items
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    const timeoutId = setTimeout(() => {
      this.isObjectListOpen = false;
      this.highlightedIndex = -1;
      this._pendingTimeouts.delete(timeoutId);
    }, 200);
    this._pendingTimeouts.add(timeoutId);
  }

  /**
   * @description Handle keyboard navigation in object dropdown
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleObjectKeydown(event) {
    if (!this.isObjectListOpen && event.key !== "ArrowDown") {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.isObjectListOpen = true;
        if (this.highlightedIndex < this.filteredObjects.length - 1) {
          this.highlightedIndex++;
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (this.highlightedIndex > 0) {
          this.highlightedIndex--;
        }
        break;
      case "Enter":
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredObjects.length) {
          const obj = this.filteredObjects[this.highlightedIndex];
          this.page2Data.selectedObjectApiName = obj.apiName;
          this.page2Data.selectedObjectLabel = obj.label;
          this.objectSearchTerm = obj.label;
          this.isObjectListOpen = false;
          this.highlightedIndex = -1;
          // Reset all field/aggregate state when object changes
          this.selectedFieldApiNames = [];
          this.fieldSearchTerm = "";
          this.expandedFields = {};
          this.aggregateFunction = null;
          this.aggregateFieldApiName = null;
          this.aggregateFieldSearchTerm = "";
          // Load fields for selected object
          this.loadFieldsForObject(obj.apiName);
        }
        break;
      case "Escape":
        event.preventDefault();
        this.isObjectListOpen = false;
        this.highlightedIndex = -1;
        break;
      default:
        break;
    }
  }

  // ==================== QUERY LIMIT HANDLER ====================

  /**
   * @description Handle Query Limit input change
   * @param {Event} event - Input change event
   */
  handleQueryLimitChange(event) {
    const value = event.target.value;
    this.queryLimit = value ? parseInt(value, 10) : null;
    this.updateSoqlPreview();
  }

  // ==================== PREVIEW QUERY HANDLERS ====================

  /**
   * @description Clear preview results and reset state
   */
  clearPreviewResults() {
    this.queryResults = [];
    this.queryColumns = [];
    this.queryTotalCount = 0;
    this.queryError = null;
  }

  /**
   * @description Execute the preview query and display results
   */
  async executeQueryPreview() {
    // Validate based on query type
    if (!this.page2Data.selectedObjectApiName) {
      this.queryError = "Object is required";
      return;
    }

    if (this.isListMode && this.selectedFieldApiNames.length === 0) {
      this.queryError = "At least one field must be selected";
      return;
    }

    if (this.isAggregateMode && !this.aggregateFunction) {
      this.queryError = "Aggregate function is required";
      return;
    }

    // For aggregate functions that require a field
    if (this.isAggregateMode && this.selectedFunctionRequiresField && !this.aggregateFieldApiName) {
      this.queryError = "Field is required for this aggregate function";
      return;
    }

    this.isQueryLoading = true;
    this.queryError = null;
    this.queryResults = [];
    this.queryColumns = [];
    this.queryTotalCount = 0;

    try {
      // Build WHERE clause for Apex
      const whereClause = this.buildWhereClause();

      if (this.isListMode) {
        // List query - use existing logic
        const result = await executePreviewQuery({
          objectApiName: this.page2Data.selectedObjectApiName,
          fieldApiNames: this.selectedFieldApiNames,
          whereClause: whereClause || null,
          queryLimit: this.queryLimit
        });

        // Transform columns for lightning-datatable
        this.queryColumns = result.columns.map((col) => ({
          label: col.label,
          fieldName: col.apiName,
          type: this.mapFieldTypeToDataTableType(col.type)
        }));

        // Set results
        this.queryResults = result.rows;
        this.queryTotalCount = result.totalCount;
      } else {
        // Aggregate query - show simplified preview
        await this.executeAggregatePreview();
      }

    } catch (error) {
      this.queryError = error.body?.message || error.message || "Error executing preview query";
    } finally {
      this.isQueryLoading = false;
    }
  }

  /**
   * @description Execute aggregate query preview - shows simplified preview for aggregate queries
   */
  async executeAggregatePreview() {
    // Build the aggregate expression for display
    let aggregateExpr;
    if (this.aggregateFunction === "COUNT" && !this.aggregateFieldApiName) {
      aggregateExpr = "COUNT()";
    } else {
      aggregateExpr = `${this.aggregateFunction}(${this.aggregateFieldApiName})`;
    }

    // For aggregate queries, show a simplified preview
    // The actual execution happens when the query is saved and used
    this.queryColumns = [{
      label: "Aggregate Expression",
      fieldName: "expression",
      type: "text"
    }, {
      label: "Description",
      fieldName: "description",
      type: "text"
    }];

    this.queryResults = [{
      expression: aggregateExpr,
      description: this.getAggregateDescription()
    }];
    this.queryTotalCount = 1;
  }

  /**
   * @description Get human-readable description of the aggregate query
   * @returns {string} Description text
   */
  getAggregateDescription() {
    const funcDescriptions = {
      COUNT: "Counts the number of records",
      COUNT_DISTINCT: "Counts unique values",
      SUM: "Calculates the total sum",
      AVG: "Calculates the average value",
      MIN: "Finds the minimum value",
      MAX: "Finds the maximum value"
    };
    return funcDescriptions[this.aggregateFunction] || "Aggregate query";
  }

  /**
   * @description Map Salesforce field type to lightning-datatable type
   * @param {string} fieldType - Salesforce field type
   * @returns {string} Datatable column type
   */
  mapFieldTypeToDataTableType(fieldType) {
    const typeMap = {
      ID: "text",
      STRING: "text",
      TEXTAREA: "text",
      PICKLIST: "text",
      MULTIPICKLIST: "text",
      EMAIL: "email",
      PHONE: "phone",
      URL: "url",
      INTEGER: "number",
      DOUBLE: "number",
      CURRENCY: "currency",
      PERCENT: "percent",
      DATE: "date",
      DATETIME: "date",
      BOOLEAN: "boolean",
      REFERENCE: "text"
    };
    return typeMap[fieldType] || "text";
  }

  // ==================== WHERE CLAUSE HANDLERS ====================

  /**
   * @description Add a new condition row
   */
  handleAddCondition() {
    this.conditionIdCounter++;
    const newCondition = {
      id: `cond_${this.conditionIdCounter}`,
      fieldApiName: "",
      fieldLabel: "",
      fieldType: "",
      operator: "",
      value: "",
      conjunction: "AND"
    };
    this.whereConditions = [...this.whereConditions, newCondition];
  }

  /**
   * @description Remove a condition row
   * @param {Event} event - Click event with data-id attribute
   */
  handleRemoveCondition(event) {
    const conditionId = event.currentTarget.dataset.id;
    this.whereConditions = this.whereConditions.filter((condition) => condition.id !== conditionId);
    this.updateSoqlPreview();
  }

  /**
   * @description Handle condition field change
   * @param {Event} event - Combobox change event
   */
  handleConditionFieldChange(event) {
    const conditionId = event.currentTarget.dataset.id;
    const fieldApiName = event.detail.value;
    const field = this.filterableFields.find((f) => f.apiName === fieldApiName);
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return {
          ...condition,
          fieldApiName: fieldApiName,
          fieldLabel: field?.label || "",
          fieldType: field?.type || "STRING",
          operator: "", // Reset operator when field changes
          value: "" // Reset value when field changes
        };
      }
      return condition;
    });
    this.updateSoqlPreview();
  }

  /**
   * @description Handle condition operator change
   * @param {Event} event - Combobox change event
   */
  handleConditionOperatorChange(event) {
    const conditionId = event.currentTarget.dataset.id;
    const operator = event.detail.value;
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return {
          ...condition,
          operator: operator,
          value: "" // Reset value when operator changes
        };
      }
      return condition;
    });
    this.updateSoqlPreview();
  }

  /**
   * @description Handle condition value change
   * @param {Event} event - Input/Combobox change event
   */
  handleConditionValueChange(event) {
    const conditionId = event.currentTarget.dataset.id;
    const value = event.detail?.value ?? event.target.value;
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return { ...condition, value: value };
      }
      return condition;
    });
    this.updateSoqlPreview();
  }

  /**
   * @description Handle condition conjunction change (AND/OR)
   * @param {Event} event - Button click event
   */
  handleConditionConjunctionChange(event) {
    const conditionId = event.currentTarget.dataset.id;
    // Support both button click (data-value) and combobox (detail.value)
    const conjunction = event.currentTarget.dataset.value || event.detail?.value;
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return { ...condition, conjunction: conjunction };
      }
      return condition;
    });
    this.updateSoqlPreview();
  }

  // ==================== QUICK FILTER HANDLERS ====================

  /**
   * @description Handle owner filter toggle (mutually exclusive)
   * @param {Event} event - Click event with data-filter attribute
   */
  handleOwnerFilterToggle(event) {
    const filterType = event.currentTarget.dataset.filter; // 'me' or 'queue'
    
    if (this.activeOwnerFilter === filterType) {
      // Clicking active filter removes it
      this.removeOwnerCondition();
      this.activeOwnerFilter = null;
    } else {
      // Switch to new filter (remove old first if exists)
      if (this.activeOwnerFilter) {
        this.removeOwnerCondition();
      }
      this.activeOwnerFilter = filterType;
      this.addOwnerCondition(filterType);
    }
    this.updateSoqlPreview();
  }

  /**
   * @description Add owner condition based on filter type
   * @param {string} filterType - 'me' or 'queue'
   */
  addOwnerCondition(filterType) {
    this.conditionIdCounter++;
    let newCondition;
    
    if (filterType === "me") {
      newCondition = {
        id: `owner_${this.conditionIdCounter}`,
        fieldApiName: "OwnerId",
        fieldLabel: "Owner ID",
        fieldType: "REFERENCE",
        operator: "equals",
        value: "{!UserId}",
        conjunction: "AND",
        isOwnerFilter: true
      };
    } else {
      newCondition = {
        id: `owner_${this.conditionIdCounter}`,
        fieldApiName: "Owner.Type",
        fieldLabel: "Owner Type",
        fieldType: "STRING",
        operator: "equals",
        value: "Queue",
        conjunction: "AND",
        isOwnerFilter: true
      };
    }
    
    this.whereConditions = [...this.whereConditions, newCondition];
  }

  /**
   * @description Remove owner condition from conditions list
   */
  removeOwnerCondition() {
    this.whereConditions = this.whereConditions.filter((c) => !c.isOwnerFilter);
  }

  /**
   * @description Get CSS class for "Owned By Me" button
   * @returns {string} CSS classes
   */
  get ownedByMeButtonClass() {
    const base = "owner-filter-btn";
    return this.activeOwnerFilter === "me" ? `${base} active` : base;
  }

  /**
   * @description Get CSS class for "Owned By Queue" button
   * @returns {string} CSS classes
   */
  get ownedByQueueButtonClass() {
    const base = "owner-filter-btn";
    return this.activeOwnerFilter === "queue" ? `${base} active` : base;
  }

  // ==================== FIELD SEARCH HANDLERS ====================

  /**
   * @description Handle field search input for condition row
   * @param {Event} event - Input event
   */
  handleConditionFieldSearchInput(event) {
    const conditionId = event.currentTarget.dataset.id;
    const searchTerm = event.target.value;
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return { ...condition, fieldSearchTerm: searchTerm };
      }
      return condition;
    });
    this.openFieldListConditionId = conditionId;
  }

  /**
   * @description Handle field focus for condition row
   * @param {Event} event - Focus event
   */
  handleConditionFieldFocus(event) {
    const conditionId = event.currentTarget.dataset.id;
    this.openFieldListConditionId = conditionId;
  }

  /**
   * @description Handle field blur for condition row
   * @param {Event} event - Blur event
   */
  handleConditionFieldBlur() {
    // Delay to allow click events on dropdown items
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    const timeoutId = setTimeout(() => {
      this.openFieldListConditionId = null;
      this._pendingTimeouts.delete(timeoutId);
    }, 200);
    this._pendingTimeouts.add(timeoutId);
  }

  /**
   * @description Handle field selection from dropdown
   * @param {Event} event - Click event
   */
  handleConditionFieldSelect(event) {
    const conditionId = event.currentTarget.dataset.id;
    const fieldApiName = event.currentTarget.dataset.field;
    const field = this.filterableFields.find((f) => f.apiName === fieldApiName);
    
    this.whereConditions = this.whereConditions.map((condition) => {
      if (condition.id === conditionId) {
        return {
          ...condition,
          fieldApiName: fieldApiName,
          fieldLabel: field?.label || "",
          fieldType: field?.type || "STRING",
          fieldSearchTerm: field?.label || fieldApiName,
          operator: "",
          value: ""
        };
      }
      return condition;
    });
    this.openFieldListConditionId = null;
    this.updateSoqlPreview();
  }

  /**
   * @description Helper to add a quick filter condition programmatically
   * Retained for API extensibility - allows parent components or future features
   * to inject pre-configured filter conditions (e.g., "Created Today", "My Records")
   * @param {Object} filterData - Filter condition data with fieldApiName, fieldLabel, fieldType, operator, value
   */
  addQuickFilterCondition(filterData) {
    this.conditionIdCounter++;
    const newCondition = {
      id: `cond_${this.conditionIdCounter}`,
      fieldApiName: filterData.fieldApiName,
      fieldLabel: filterData.fieldLabel,
      fieldType: filterData.fieldType,
      operator: filterData.operator,
      value: filterData.value,
      conjunction: "AND",
      isDateLiteral: filterData.isDateLiteral || false
    };
    this.whereConditions = [...this.whereConditions, newCondition];
    this.updateSoqlPreview();
  }

  /**
   * @description Get filterable fields for WHERE clause
   * @returns {Array} Fields that can be used in WHERE clause
   */
  get filterableFields() {
    return this.allFields.filter((f) => f.isFilterable);
  }

  // ==================== PAGE 3 GETTERS ====================

  /**
   * @description Get conditions with metadata for rendering
   * @returns {Array} Conditions with isFirst flag and computed properties
   */
  get conditionsWithMeta() {
    return this.whereConditions.map((condition, index) => {
      const field = this.filterableFields.find((f) => f.apiName === condition.fieldApiName);
      const mappedType = HM_DataSourceQueryBuilder.FIELD_TYPE_MAP[condition.fieldType] || "STRING";
      const operators = HM_DataSourceQueryBuilder.OPERATORS[mappedType] || HM_DataSourceQueryBuilder.OPERATORS.STRING;
      
      // Determine value input type and visibility
      const nullOperators = ["is_null", "is_not_null"];
      const dateLiteralOperators = [
        "date_today", "date_gt_today", "date_lt_today",
        "date_this_week", "date_this_month", "date_this_year"
      ];
      const showValueInput = !nullOperators.includes(condition.operator) && !dateLiteralOperators.includes(condition.operator);
      const showNDaysInput = ["date_last_n_days", "date_gt_last_n_days", "date_next_n_days", "date_lt_next_n_days"].includes(condition.operator);
      const isPicklistField = condition.fieldType === "PICKLIST" || condition.fieldType === "MULTIPICKLIST";
      const isBooleanField = condition.fieldType === "BOOLEAN";
      const isNumberField = ["INTEGER", "DOUBLE", "CURRENCY", "PERCENT"].includes(condition.fieldType);
      const isDateField = condition.fieldType === "DATE" || condition.fieldType === "DATETIME";
      
      let valueInputType = "text";
      if (isNumberField) valueInputType = "number";
      if (isDateField && !showNDaysInput) valueInputType = "date";
      
      // Field search properties
      const fieldSearchTerm = condition.fieldSearchTerm || (field ? field.label : "");
      const isFieldListOpen = this.openFieldListConditionId === condition.id;
      const searchTermLower = (condition.fieldSearchTerm || "").toLowerCase();
      const filteredFieldOptions = this.filterableFields
        .filter((f) => {
          if (!searchTermLower) return true;
          return f.label.toLowerCase().includes(searchTermLower) || 
                 f.apiName.toLowerCase().includes(searchTermLower);
        })
        .slice(0, 50)
        .map((f) => ({ ...f }));
      const noFieldsMatch = isFieldListOpen && filteredFieldOptions.length === 0 && searchTermLower;
      
      // Button classes for AND/OR toggle
      const andButtonClass = condition.conjunction === "AND" 
        ? "conjunction-btn conjunction-btn-active" 
        : "conjunction-btn";
      const orButtonClass = condition.conjunction === "OR" 
        ? "conjunction-btn conjunction-btn-active" 
        : "conjunction-btn";

      return {
        ...condition,
        index,
        isFirst: index === 0,
        showConjunction: index > 0,
        operatorOptions: operators,
        picklistOptions: field?.picklistValues?.map((pv) => ({ label: pv.label, value: pv.value })) || [],
        isOperatorDisabled: !condition.fieldApiName,
        isValueDisabled: !condition.operator,
        showValueInput,
        showNDaysInput,
        isPicklistField,
        isBooleanField,
        isNumberField,
        isDateField,
        valueInputType,
        showDefaultInput: showValueInput && !isPicklistField && !isBooleanField && !showNDaysInput,
        // Field search
        fieldSearchTerm,
        isFieldListOpen,
        filteredFieldOptions,
        noFieldsMatch,
        // AND/OR toggle classes
        andButtonClass,
        orButtonClass
      };
    });
  }

  /**
   * @description Check if there are conditions
   * @returns {boolean} True if conditions exist
   */
  get hasConditions() {
    return this.whereConditions.length > 0;
  }

  /**
   * @description Get condition count for display
   * @returns {number} Number of conditions
   */
  get conditionCount() {
    return this.whereConditions.length;
  }

  /**
   * @description Get field options for condition dropdowns
   * @returns {Array} Filterable fields formatted for combobox
   */
  get conditionFieldOptions() {
    return this.filterableFields.map((f) => ({
      label: `${f.label} (${f.apiName})`,
      value: f.apiName
    }));
  }

  /**
   * @description Get conjunction options (AND/OR)
   * @returns {Array} Conjunction options
   */
  get conjunctionOptions() {
    return [
      { label: "AND", value: "AND" },
      { label: "OR", value: "OR" }
    ];
  }

  /**
   * @description Get boolean options for boolean fields
   * @returns {Array} Boolean options
   */
  get booleanOptions() {
    return [
      { label: "True", value: "true" },
      { label: "False", value: "false" }
    ];
  }

  /**
   * @description Check if object has OwnerId field
   * @returns {boolean} True if OwnerId field exists and is filterable
   */
  get hasOwnerField() {
    return this.filterableFields.some((f) => f.apiName === "OwnerId");
  }

  /**
   * @description Filter objects based on search term
   */
  filterObjects() {
    const term = this.objectSearchTerm.toLowerCase().trim();
    if (!term) {
      // Show first 50 objects when no search term
      this.filteredObjects = this.allObjects.slice(0, 50).map((obj, index) => ({
        ...obj,
        itemClass: this.getItemClass(index)
      }));
    } else {
      this.filteredObjects = this.allObjects
        .filter(
          (obj) =>
            obj.label.toLowerCase().includes(term) || obj.apiName.toLowerCase().includes(term)
        )
        .slice(0, 50)
        .map((obj, index) => ({
          ...obj,
          itemClass: this.getItemClass(index)
        }));
    }
  }

  /**
   * @description Get CSS class for dropdown item
   * @param {number} index - Item index
   * @returns {string} CSS classes
   */
  getItemClass(index) {
    const baseClass = "slds-media slds-listbox__option slds-listbox__option_entity";
    return index === this.highlightedIndex ? `${baseClass} slds-has-focus` : baseClass;
  }

  /**
   * @description Check if no results message should be shown
   * @returns {boolean} True if no results and search term exists
   */
  get showNoResults() {
    return (
      this.isObjectListOpen &&
      !this.isLoadingObjects &&
      this.filteredObjects.length === 0 &&
      this.objectSearchTerm.trim() !== ""
    );
  }

  /**
   * @description Get combobox container classes
   * @returns {string} CSS classes for combobox
   */
  get comboboxClasses() {
    const base = "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
    return this.isObjectListOpen ? `${base} slds-is-open` : base;
  }

  /**
   * @description Get filtered field options with selection state, including inline expanded children
   * Search includes both parent fields and their cached children - if a child matches,
   * the parent is shown (auto-expanded) with matching children
   * @returns {Array} Field options filtered by search term with selection and expand state
   */
  get filteredFieldOptions() {
    const term = this.fieldSearchTerm.toLowerCase().trim();
    const result = [];

    for (const field of this.allFields) {
      const expandState = this.expandedFields[field.apiName] || {};
      const isExpandable = field.isReference && field.relationshipName;
      const children = expandState.children || [];

      // Check if parent matches search
      const parentMatches =
        !term ||
        field.label.toLowerCase().includes(term) ||
        field.apiName.toLowerCase().includes(term);

      // Check if any cached children match search (only if expanded/loaded)
      const matchingChildren = children.filter(
        (c) =>
          !term ||
          c.label.toLowerCase().includes(term) ||
          c.apiName.toLowerCase().includes(term)
      );
      const hasMatchingChildren = matchingChildren.length > 0;

      // Include parent if it matches OR if any children match
      if (!parentMatches && !hasMatchingChildren) {
        continue;
      }

      // Determine if we should show as expanded (user expanded OR children match search)
      const shouldShowExpanded = expandState.expanded || (term && hasMatchingChildren);

      result.push({
        ...field,
        displayLabel: `${field.label} (${field.apiName})`,
        isSelected: this.selectedFieldApiNames.includes(field.apiName),
        isExpandable: isExpandable,
        isExpanded: shouldShowExpanded,
        isLoading: expandState.loading || false,
        isChild: false,
        itemClass: "field-checkbox-item",
        chevronIcon: shouldShowExpanded ? "utility:chevrondown" : "utility:chevronright"
      });

      // Add children if expanded (or auto-expanded due to search match)
      if (shouldShowExpanded && children.length > 0) {
        for (const child of matchingChildren) {
          result.push({
            ...child,
            displayLabel: `${child.label} (${child.apiName.split(".").pop()})`,
            isSelected: this.selectedFieldApiNames.includes(child.apiName),
            isExpandable: false,
            isExpanded: false,
            isLoading: false,
            isChild: true,
            itemClass: "field-checkbox-item field-checkbox-item--child",
            chevronIcon: null,
            parentApiName: field.apiName
          });
        }
      }
    }
    return result;
  }

  /**
   * @description Check if there are filtered fields to display
   * @returns {boolean} True if filtered fields exist
   */
  get hasFilteredFields() {
    return this.filteredFieldOptions.length > 0;
  }

  /**
   * @description Get count of selected fields
   * @returns {number} Number of selected fields
   */
  get selectedFieldCount() {
    return this.selectedFieldApiNames.length;
  }

  // ==================== DATA LOADING ====================

  /**
   * @description Load existing data source record for editing
   */
  async loadExistingData() {
    if (!this.recordId) {
      return;
    }

    this.isLoading = true;
    this.clearError();

    try {
      const data = await loadDataSource({ recordId: this.recordId });

      if (!data) {
        throw new Error("No data returned from server");
      }

      // Page 1 - Basic Info
      this.formData.name = data.name || "";
      this.formData.active = data.active !== undefined ? data.active : true;
      this.formData.dashboardComponentId = data.dashboardComponentId || null;
      this.formData.order = data.order !== undefined ? data.order : 1;
      this.formData.rowIconName = data.rowIconName || "";
      // componentType is set by the wire adapter when dashboardComponentId changes

      // Deserialize query config (Page 2 + 3 state)
      await this.deserializeQueryConfig(data.queryConfig);

    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Unknown error occurred";
      this.showError("Load Error", `Failed to load existing data source: ${errorMessage}`);
    } finally {
      this.isLoading = false;
    }
  }

  // ==================== UI HELPERS ====================

  /**
   * @description Get page title
   * @returns {string} Page title
   */
  get pageTitle() {
    return this.recordId ? "Edit Data Source" : "New Data Source";
  }

  /**
   * @description Get page subtitle with context
   * @returns {string} Subtitle text
   */
  get pageSubtitle() {
    if (this.formData.name) {
      return `Configure query for "${this.formData.name}"`;
    }
    return "Configure query parameters and save";
  }

  /**
   * @description Get fields accordion label with count
   * @returns {string} Label with field count
   */
  get fieldsAccordionLabel() {
    return `Fields (${this.selectedFieldCount} selected)`;
  }

  /**
   * @description Get filters accordion label with count
   * @returns {string} Label with condition count
   */
  get filtersAccordionLabel() {
    const count = this.whereConditions.length;
    return count > 0 ? `Filters (${count})` : "Filters";
  }

  /**
   * @description Get preview accordion label with record count
   * @returns {string} Label with result count if available
   */
  get previewAccordionLabel() {
    if (this.isQueryLoading) {
      return "Preview Results (loading...)";
    }
    if (this.hasQueryResults) {
      return `Preview Results (${this.queryTotalCount} records)`;
    }
    return "Preview Results";
  }

  /**
   * @description Check if query type is List
   * @returns {boolean} True if List mode
   */
  get isListMode() {
    return this.queryType === "List";
  }

  /**
   * @description Check if query type is Aggregate
   * @returns {boolean} True if Aggregate mode
   */
  get isAggregateMode() {
    return this.queryType === "Aggregate";
  }

  /**
   * @description Get aggregate function options for dropdown
   * @returns {Array} Options for combobox
   */
  get aggregateFunctionOptions() {
    return HM_DataSourceQueryBuilder.AGGREGATE_FUNCTIONS.map((f) => ({
      label: f.label,
      value: f.value
    }));
  }

  /**
   * @description Get the selected aggregate function config
   * @returns {Object|null} Function config or null
   */
  getSelectedAggregateFunction() {
    if (!this.aggregateFunction) return null;
    return HM_DataSourceQueryBuilder.AGGREGATE_FUNCTIONS.find(
      (f) => f.value === this.aggregateFunction
    );
  }

  /**
   * @description Get field options filtered by selected aggregate function
   * @returns {Array} Options for combobox
   */
  get aggregateFieldOptions() {
    const func = this.getSelectedAggregateFunction();
    if (!func) return [];

    return this.allFields
      .filter((f) => {
        if (!func.fieldTypes) return true; // No filter for COUNT, COUNT_DISTINCT, MIN, MAX
        return func.fieldTypes.includes(f.type);
      })
      .map((f) => ({
        label: `${f.label} (${f.apiName})`,
        value: f.apiName
      }));
  }

  /**
   * @description Check if selected function requires a field
   * @returns {boolean} True if field is required
   */
  get selectedFunctionRequiresField() {
    const func = this.getSelectedAggregateFunction();
    return func?.requiresField ?? false;
  }

  /**
   * @description Check if aggregate field selector should be shown
   * @returns {boolean} True if field selector should show
   */
  get showAggregateFieldSelector() {
    return this.aggregateFunction !== null;
  }

  /**
   * @description Get label for aggregate field based on function
   * @returns {string} Label text
   */
  get aggregateFieldLabel() {
    if (this.aggregateFunction === "COUNT") {
      return "Field (optional for COUNT)";
    }
    return "Field";
  }

  /**
   * @description Get CSS classes for aggregate field combobox
   * @returns {string} CSS classes
   */
  get aggregateFieldComboboxClasses() {
    let classes = "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
    if (this.isAggregateFieldListOpen) {
      classes += " slds-is-open";
    }
    return classes;
  }

  /**
   * @description Check if there are filtered aggregate fields to display
   * @returns {boolean} True if there are fields
   */
  get hasFilteredAggregateFields() {
    return this.filteredAggregateFields && this.filteredAggregateFields.length > 0;
  }

  /**
   * @description Get CSS class for List button in toggle
   * @returns {string} CSS classes
   */
  get listButtonClass() {
    const base = "slds-button query-type-btn";
    return this.isListMode ? `${base} slds-button_brand` : `${base} slds-button_neutral`;
  }

  /**
   * @description Get CSS class for Aggregate button in toggle
   * @returns {string} CSS classes
   */
  get aggregateButtonClass() {
    const base = "slds-button query-type-btn";
    return this.isAggregateMode ? `${base} slds-button_brand` : `${base} slds-button_neutral`;
  }

  /**
   * @description Check if field selection should be shown (List mode + object selected)
   * @returns {boolean} True if field selection should show
   */
  get showFieldSelection() {
    return this.page2Data.selectedObjectApiName && this.isListMode;
  }

  /**
   * @description Check if aggregate section should be shown (Aggregate mode + object selected)
   * @returns {boolean} True if aggregate section should show
   */
  get showAggregateSection() {
    return this.page2Data.selectedObjectApiName && this.isAggregateMode;
  }


  /**
   * @description Check if there are query results
   * @returns {boolean} True if results exist
   */
  get hasQueryResults() {
    return this.queryResults && this.queryResults.length > 0;
  }

  /**
   * @description Get query results count for display
   * @returns {number} Number of preview rows
   */
  get queryResultsCount() {
    return this.queryResults ? this.queryResults.length : 0;
  }

  /**
   * @description Check if Save button should be disabled
   * @returns {boolean} True if save should be disabled
   */
  get isSaveDisabled() {
    return this.isSaving || this.isLoading || !this.isFormValid;
  }

  /**
   * @description Check if the entire form is valid (all required fields filled)
   * @returns {boolean} True if form is valid and ready to save
   */
  get isFormValid() {
    // Basic Info validation
    if (!this.hasRequiredBasicInfo || !this.isIconNameValidOrEmpty) {
      return false;
    }
    // Object must be selected
    if (!this.page2Data.selectedObjectApiName) {
      return false;
    }
    // Field/Aggregate validation
    if (!this.isFieldSelectionValid) {
      return false;
    }
    // WHERE conditions validation
    if (!this.areConditionsValid) {
      return false;
    }
    return true;
  }

  /**
   * @description Check if field selection is valid based on query type
   * @returns {boolean} True if field selection is valid
   */
  get isFieldSelectionValid() {
    // List mode: at least one field must be selected
    if (this.isListMode) {
      return this.selectedFieldApiNames.length > 0;
    }

    // Aggregate mode: function must be selected, field required for most functions
    if (this.isAggregateMode) {
      if (!this.aggregateFunction) {
        return false;
      }
      const func = this.getSelectedAggregateFunction();
      if (func && func.requiresField && !this.aggregateFieldApiName) {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * @description Check if WHERE conditions are valid (optional but must be complete if present)
   * @returns {boolean} True if conditions are valid
   */
  get areConditionsValid() {
    // WHERE conditions are optional
    if (this.whereConditions.length === 0) {
      return true;
    }
    // If conditions exist, validate each one
    const nullOperators = ["is_null", "is_not_null"];
    const dateLiteralOperators = [
      "date_today", "date_gt_today", "date_lt_today",
      "date_this_week", "date_this_month", "date_this_year"
    ];
    return this.whereConditions.every((condition) => {
      // Must have field and operator
      if (!condition.fieldApiName || !condition.operator) {
        return false;
      }
      // Value is required unless operator doesn't need one
      if (
        !nullOperators.includes(condition.operator) &&
        !dateLiteralOperators.includes(condition.operator)
      ) {
        return condition.value !== "" && condition.value !== null && condition.value !== undefined;
      }
      return true;
    });
  }

  /**
   * @description Check if basic info has all required fields
   * @returns {boolean} True if required fields are filled
   */
  get hasRequiredBasicInfo() {
    return (
      this.formData.name &&
      this.formData.name.trim() !== "" &&
      this.formData.dashboardComponentId !== null &&
      this.formData.order !== null &&
      this.formData.order !== undefined
    );
  }

  /**
   * @description Check if icon name is valid or empty (empty is allowed)
   * @returns {boolean} True if icon is valid or not provided
   */
  get isIconNameValidOrEmpty() {
    if (!this.showRowIconInput) {
      return true;
    }
    const iconName = this.formData.rowIconName?.trim();
    if (!iconName) {
      return true; // Empty is valid
    }
    return this.isValidIconName;
  }

  /**
   * @description Check if Row Icon input should be shown
   * @returns {boolean} True if component type is List
   */
  get showRowIconInput() {
    return this.componentType === "List";
  }

  /**
   * @description Valid icon prefixes for Lightning icons
   */
  static VALID_ICON_PREFIXES = ["action:", "custom:", "doctype:", "standard:", "utility:"];

  /**
   * @description Check if the row icon name has a valid prefix
   * @returns {boolean} True if icon name starts with a valid prefix
   */
  get isValidIconName() {
    const iconName = this.formData.rowIconName?.trim().toLowerCase();
    if (!iconName) {
      return false;
    }
    return HM_DataSourceQueryBuilder.VALID_ICON_PREFIXES.some((prefix) =>
      iconName.startsWith(prefix)
    );
  }

  /**
   * @description Check if icon preview should be shown
   * @returns {boolean} True if row icon name is valid
   */
  get showIconPreview() {
    return this.showRowIconInput && this.isValidIconName && this.isIconNameConfirmed;
  }

  /**
   * @description Check if icon preview should show placeholder
   * @returns {boolean} True if showing placeholder
   */
  get showIconPlaceholder() {
    return this.showRowIconInput && !this.showIconPreview;
  }

  /**
   * @description Get error message for invalid icon name
   * @returns {string} Error message or empty string
   */
  get iconNameError() {
    const iconName = this.formData.rowIconName?.trim();
    if (iconName && !this.isValidIconName) {
      return "Must start with: action:, custom:, doctype:, standard:, or utility:";
    }
    return "";
  }

  // ==================== SOQL PREVIEW ====================

  /**
   * @description Map operator to SOQL syntax
   */
  static OPERATOR_MAP = {
    equals: "=",
    not_equals: "!=",
    contains: "LIKE",
    starts_with: "LIKE",
    ends_with: "LIKE",
    less_than: "<",
    greater_than: ">",
    less_or_equal: "<=",
    greater_or_equal: ">=",
    is_null: "=",
    is_not_null: "!=",
    includes: "INCLUDES",
    excludes: "EXCLUDES",
    date_today: "=",
    date_this_week: "=",
    date_this_month: "=",
    date_this_year: "=",
    date_last_n_days: "=",
    date_next_n_days: "="
  };

  /**
   * @description Generate formatted SOQL query string
   * @returns {string} Formatted SOQL query or empty string
   */
  get generatedSoql() {
    if (!this.page2Data.selectedObjectApiName) {
      return "";
    }

    // Handle List mode
    if (this.isListMode) {
      if (this.selectedFieldApiNames.length === 0) {
        return "";
      }

      const fields = this.selectedFieldApiNames.join(",\n       ");
      let query = `SELECT ${fields}\n  FROM ${this.page2Data.selectedObjectApiName}`;

      // Add WHERE clause if conditions exist
      const whereClause = this.buildWhereClause();
      if (whereClause) {
        query += `\n WHERE ${whereClause}`;
      }

      // Add LIMIT clause if set
      if (this.queryLimit) {
        query += `\n LIMIT ${this.queryLimit}`;
      }

      return query;
    }

    // Handle Aggregate mode
    if (this.isAggregateMode) {
      if (!this.aggregateFunction) {
        return "";
      }

      // Build SELECT clause
      let selectClause;
      if (this.aggregateFunction === "COUNT" && !this.aggregateFieldApiName) {
        selectClause = "COUNT()";
      } else if (!this.aggregateFieldApiName) {
        // Field required but not selected
        return "";
      } else {
        selectClause = `${this.aggregateFunction}(${this.aggregateFieldApiName})`;
      }

      let query = `SELECT ${selectClause}\n  FROM ${this.page2Data.selectedObjectApiName}`;

      // Add WHERE clause if conditions exist
      const whereClause = this.buildWhereClause();
      if (whereClause) {
        query += `\n WHERE ${whereClause}`;
      }

      // Note: LIMIT is not typically used with aggregate queries
      // but we can include it if set (SOQL allows it)

      return query;
    }

    return "";
  }

  /**
   * @description Build WHERE clause from conditions with proper OR grouping
   * @returns {string} WHERE clause or empty string
   */
  buildWhereClause() {
    const validConditions = this.whereConditions.filter(
      (c) => c.fieldApiName && c.operator
    );

    if (validConditions.length === 0) {
      return "";
    }

    // Check if we have mixed conjunctions (need parentheses for OR groups)
    const hasOr = validConditions.some((c, i) => i > 0 && c.conjunction === "OR");
    const hasAnd = validConditions.some((c, i) => i > 0 && c.conjunction === "AND");
    const hasMixedConjunctions = hasOr && hasAnd;

    if (!hasMixedConjunctions) {
      // Simple case: all same conjunction, no grouping needed
      return validConditions
        .map((condition, index) => {
          const clause = this.buildConditionClause(condition);
          if (index === 0) {
            return clause;
          }
          return `\n    ${condition.conjunction} ${clause}`;
        })
        .join("");
    }

    // Complex case: mixed AND/OR - group consecutive OR conditions
    let result = "";
    let inOrGroup = false;

    validConditions.forEach((condition, index) => {
      const clause = this.buildConditionClause(condition);
      const isOr = condition.conjunction === "OR";
      const nextIsOr = index < validConditions.length - 1 && 
                       validConditions[index + 1].conjunction === "OR";

      if (index === 0) {
        result = clause;
      } else if (isOr) {
        // Starting or continuing OR group
        if (!inOrGroup) {
          // Starting new OR group - wrap previous clause and this one
          result += `\n    AND (${clause}`;
          inOrGroup = true;
        } else {
          result += `\n         OR ${clause}`;
        }
        
        // Close OR group if next is not OR
        if (!nextIsOr && inOrGroup) {
          result += ")";
          inOrGroup = false;
        }
      } else {
        // AND conjunction
        result += `\n    AND ${clause}`;
      }
    });

    // Close any unclosed OR group
    if (inOrGroup) {
      result += ")";
    }

    return result;
  }

  /**
   * @description Build a single condition clause
   * @param {Object} condition - Condition object
   * @returns {string} Formatted condition clause
   */
  buildConditionClause(condition) {
    const operator = HM_DataSourceQueryBuilder.OPERATOR_MAP[condition.operator] || "=";
    const field = condition.fieldApiName;

    // Handle null operators
    if (condition.operator === "is_null") {
      return `${field} = null`;
    }
    if (condition.operator === "is_not_null") {
      return `${field} != null`;
    }

    // Handle date literals with equals operator
    if (condition.operator === "date_today") {
      return `${field} = TODAY`;
    }
    if (condition.operator === "date_this_week") {
      return `${field} = THIS_WEEK`;
    }
    if (condition.operator === "date_this_month") {
      return `${field} = THIS_MONTH`;
    }
    if (condition.operator === "date_this_year") {
      return `${field} = THIS_YEAR`;
    }
    if (condition.operator === "date_last_n_days") {
      return `${field} = LAST_N_DAYS:${condition.value}`;
    }
    if (condition.operator === "date_next_n_days") {
      return `${field} = NEXT_N_DAYS:${condition.value}`;
    }

    // Handle date literals with comparison operators (>, >=, <, <=)
    if (condition.operator === "date_gt_today") {
      return `${field} > TODAY`;
    }
    if (condition.operator === "date_lt_today") {
      return `${field} < TODAY`;
    }
    if (condition.operator === "date_gt_last_n_days") {
      return `${field} > LAST_N_DAYS:${condition.value}`;
    }
    if (condition.operator === "date_lt_next_n_days") {
      return `${field} < NEXT_N_DAYS:${condition.value}`;
    }

    // Handle LIKE operators - escape single quotes to prevent SOQL injection
    if (condition.operator === "contains") {
      const escapedValue = this.escapeSoqlValue(condition.value);
      return `${field} LIKE '%${escapedValue}%'`;
    }
    if (condition.operator === "starts_with") {
      const escapedValue = this.escapeSoqlValue(condition.value);
      return `${field} LIKE '${escapedValue}%'`;
    }
    if (condition.operator === "ends_with") {
      const escapedValue = this.escapeSoqlValue(condition.value);
      return `${field} LIKE '%${escapedValue}'`;
    }

    // Handle special values
    if (condition.value === "{!UserId}") {
      return `${field} ${operator} :UserInfo.getUserId()`;
    }

    // Handle boolean values
    if (condition.fieldType === "BOOLEAN") {
      return `${field} ${operator} ${condition.value}`;
    }

    // Handle numeric types (no quotes)
    const numericTypes = ["INTEGER", "DOUBLE", "CURRENCY", "PERCENT"];
    if (numericTypes.includes(condition.fieldType)) {
      return `${field} ${operator} ${condition.value}`;
    }

    // Handle Date and DateTime types (no quotes for date literals)
    // SOQL requires: ClosedDate = 2025-01-26 (NOT '2025-01-26')
    const dateTypes = ["DATE", "DATETIME"];
    if (dateTypes.includes(condition.fieldType)) {
      const dateValue = condition.value;
      // Validate date format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ)
      if (this.isValidDateFormat(dateValue)) {
        return `${field} ${operator} ${dateValue}`;
      }
      // If invalid format, still output without quotes but let SOQL validation catch it
      return `${field} ${operator} ${dateValue}`;
    }

    // Handle INCLUDES/EXCLUDES for multipicklist - escape value
    if (condition.operator === "includes" || condition.operator === "excludes") {
      const escapedValue = this.escapeSoqlValue(condition.value);
      return `${field} ${operator} ('${escapedValue}')`;
    }

    // Fallback: detect date values by format pattern (safety net for when fieldType is not set correctly)
    // This prevents quoting date values that should be unquoted in SOQL
    const dateFormatPattern = /^\d{4}-\d{2}-\d{2}/;
    if (condition.value && dateFormatPattern.test(condition.value)) {
      return `${field} ${operator} ${condition.value}`;
    }

    // Default: string value with quotes - escape to prevent SOQL injection
    const escapedValue = this.escapeSoqlValue(condition.value);
    return `${field} ${operator} '${escapedValue}'`;
  }

  /**
   * @description SQL keywords for syntax highlighting
   */
  static SQL_KEYWORDS = [
    "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE",
    "ORDER", "BY", "ASC", "DESC", "NULLS", "FIRST", "LAST",
    "LIMIT", "OFFSET", "GROUP", "HAVING", "WITH", "USING", "SCOPE"
  ];

  /**
   * @description SQL functions and operators for syntax highlighting
   */
  static SQL_FUNCTIONS = [
    "COUNT", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX",
    "CALENDAR_MONTH", "CALENDAR_YEAR", "DAY_IN_MONTH", "DAY_IN_WEEK",
    "FISCAL_MONTH", "FISCAL_QUARTER", "FISCAL_YEAR", "HOUR_IN_DAY",
    "WEEK_IN_MONTH", "WEEK_IN_YEAR"
  ];

  /**
   * @description Date literals for syntax highlighting
   */
  static SQL_DATE_LITERALS = [
    "TODAY", "YESTERDAY", "TOMORROW", "LAST_WEEK", "THIS_WEEK", "NEXT_WEEK",
    "LAST_MONTH", "THIS_MONTH", "NEXT_MONTH", "LAST_90_DAYS", "NEXT_90_DAYS",
    "LAST_N_DAYS", "NEXT_N_DAYS", "THIS_QUARTER", "LAST_QUARTER", "NEXT_QUARTER",
    "THIS_YEAR", "LAST_YEAR", "NEXT_YEAR", "THIS_FISCAL_QUARTER", "LAST_FISCAL_QUARTER",
    "NEXT_FISCAL_QUARTER", "THIS_FISCAL_YEAR", "LAST_FISCAL_YEAR", "NEXT_FISCAL_YEAR"
  ];

  /**
   * @description Tokenize SOQL for syntax highlighting
   * @returns {Array} Array of token objects with id, value, and className
   */
  get soqlTokens() {
    const soql = this.generatedSoql;
    if (!soql) return [];

    const tokens = [];
    let tokenId = 0;

    // Regex to match different token types
    const tokenRegex = /(:[\w.]+\(\))|('[^']*')|(\d+)|([A-Za-z_][\w_.]*)|(\s+)|([^\s\w]+)/g;
    let match;

    while ((match = tokenRegex.exec(soql)) !== null) {
      const value = match[0];
      let className = "sql-field"; // default

      const upperValue = value.toUpperCase();

      if (/^\s+$/.test(value)) {
        // Whitespace - preserve formatting
        className = "";
      } else if (value.startsWith(":")) {
        // Apex variable binding
        className = "sql-variable";
      } else if (value.startsWith("'") && value.endsWith("'")) {
        // String literal
        className = "sql-string";
      } else if (/^\d+$/.test(value)) {
        // Number
        className = "sql-number";
      } else if (HM_DataSourceQueryBuilder.SQL_KEYWORDS.includes(upperValue)) {
        // SQL keyword
        className = "sql-keyword";
      } else if (HM_DataSourceQueryBuilder.SQL_FUNCTIONS.some(f => upperValue.startsWith(f))) {
        // SQL function
        className = "sql-function";
      } else if (HM_DataSourceQueryBuilder.SQL_DATE_LITERALS.some(d => upperValue.startsWith(d))) {
        // Date literal
        className = "sql-literal";
      } else if (/^[=!<>]+$/.test(value) || value === "(" || value === ")" || value === ",") {
        // Operator/punctuation
        className = "sql-operator";
      } else if (this.page2Data.selectedObjectApiName && 
                 upperValue === this.page2Data.selectedObjectApiName.toUpperCase()) {
        // Object name
        className = "sql-object";
      }

      tokens.push({
        id: `token-${tokenId++}`,
        value: value,
        className: className
      });
    }

    return tokens;
  }

  /**
   * @description Update SOQL preview display and trigger auto-refresh
   * Triggers debounced preview query execution when configuration changes
   */
  updateSoqlPreview() {
    // Clear any pending auto-refresh
    if (this._autoRefreshTimeoutId) {
      clearTimeout(this._autoRefreshTimeoutId);
    }

    // Debounce auto-refresh to avoid excessive queries during rapid changes
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._autoRefreshTimeoutId = setTimeout(() => {
      this.triggerAutoRefresh();
    }, 750);
  }

  /**
   * @description Trigger auto-refresh of preview results
   * Only executes if we have a valid query configuration
   */
  triggerAutoRefresh() {
    // Only auto-refresh if we have valid query configuration
    if (!this.page2Data.selectedObjectApiName) {
      return;
    }

    // For List mode, need at least one field selected
    if (this.isListMode && this.selectedFieldApiNames.length === 0) {
      return;
    }

    // For Aggregate mode, need a function selected
    if (this.isAggregateMode && !this.aggregateFunction) {
      return;
    }

    // Execute preview query
    this.executeQueryPreview();
  }

  // ==================== CONFIG SERIALIZATION ====================

  /**
   * @description Serialize wizard state to JSON for storage
   * @returns {string} JSON string of wizard configuration
   */
  serializeQueryConfig() {
    return JSON.stringify({
      objectApiName: this.page2Data.selectedObjectApiName,
      objectLabel: this.page2Data.selectedObjectLabel,
      queryType: this.queryType,
      selectedFields: this.selectedFieldApiNames,
      aggregateFunction: this.aggregateFunction,
      aggregateFieldApiName: this.aggregateFieldApiName,
      aggregateFieldSearchTerm: this.aggregateFieldSearchTerm,
      whereConditions: this.whereConditions.map((c) => ({
        id: c.id,
        fieldApiName: c.fieldApiName,
        fieldLabel: c.fieldLabel,
        fieldType: c.fieldType,
        operator: c.operator,
        value: c.value,
        conjunction: c.conjunction
      })),
      activeOwnerFilter: this.activeOwnerFilter,
      queryLimit: this.queryLimit
    });
  }

  /**
   * @description Deserialize stored JSON config back into wizard state
   * @param {string} configJson - JSON string of wizard configuration
   */
  async deserializeQueryConfig(configJson) {
    if (!configJson) return;

    try {
      const config = JSON.parse(configJson);

      // Restore Page 2 state
      this.page2Data.selectedObjectApiName = config.objectApiName || null;
      this.page2Data.selectedObjectLabel = config.objectLabel || null;
      this.objectSearchTerm = config.objectLabel || "";
      this.queryType = config.queryType || "List";
      this.aggregateFunction = config.aggregateFunction || null;
      this.aggregateFieldApiName = config.aggregateFieldApiName || null;
      this.aggregateFieldSearchTerm = config.aggregateFieldSearchTerm || "";

      // Load fields for the object (needed for field labels, WHERE dropdowns)
      // Note: loadFieldsForObject resets selectedFieldApiNames, so we restore them AFTER
      if (config.objectApiName) {
        await this.loadFieldsForObject(config.objectApiName);
        // Filter aggregate fields if in aggregate mode
        if (this.isAggregateMode && this.aggregateFunction) {
          this.filterAggregateFields();
        }
      }

      // Restore selected fields AFTER loadFieldsForObject (which resets them)
      this.selectedFieldApiNames = config.selectedFields || [];

      // Auto-expand lookup fields that have selected relationship children
      await this.autoExpandFieldsWithSelectedChildren();

      // Restore Page 3 state
      this.whereConditions = (config.whereConditions || []).map((c) => ({
        ...c,
        id: c.id || `cond_${++this.conditionIdCounter}`
      }));
      this.activeOwnerFilter = config.activeOwnerFilter || null;
      this.queryLimit = config.queryLimit || null;

      // Update SOQL preview
      this.updateSoqlPreview();
    } catch (e) {
      // Config parsing failed - notify user with safe error message
      const errorMsg = e && e.message ? e.message : "Unknown error";
      this.showError("Configuration Error", "Failed to load saved query configuration: " + errorMsg);
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * @description Close the wizard - dispatches event for Aura wrapper to handle navigation
   */
  closePanel() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  /**
   * @description Show error toast message
   * @param {string} title - Error title
   * @param {string} message - Error message
   */
  showError(title, message) {
    this.error = message;
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: "error",
        mode: "sticky"
      })
    );
  }

  /**
   * @description Show success toast message
   * @param {string} title - Success title
   * @param {string} message - Success message
   * @param {string} variant - Toast variant
   */
  showToast(title, message, variant = "success") {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: variant
      })
    );
  }

  /**
   * @description Escape special characters in SOQL string values to prevent injection
   * Escapes single quotes and backslashes per Salesforce SOQL specification
   * @param {string} value - Raw string value to escape
   * @returns {string} Escaped string safe for SOQL query construction
   */
  escapeSoqlValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    // Escape backslashes first, then single quotes
    return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  /**
   * @description Validate that a value is a valid SOQL date/datetime format
   * Supports: YYYY-MM-DD (Date) and YYYY-MM-DDThh:mm:ssZ (DateTime)
   * Also supports relative date literals like TODAY, YESTERDAY, etc.
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid date format for SOQL
   */
  isValidDateFormat(value) {
    if (!value || typeof value !== "string") {
      return false;
    }
    const trimmed = value.trim();
    // Check for SOQL date literals (TODAY, YESTERDAY, LAST_N_DAYS:n, etc.)
    const dateLiteralPattern = /^(TODAY|YESTERDAY|TOMORROW|LAST_WEEK|THIS_WEEK|NEXT_WEEK|LAST_MONTH|THIS_MONTH|NEXT_MONTH|LAST_90_DAYS|NEXT_90_DAYS|LAST_N_DAYS:\d+|NEXT_N_DAYS:\d+|THIS_QUARTER|LAST_QUARTER|NEXT_QUARTER|THIS_YEAR|LAST_YEAR|NEXT_YEAR|THIS_FISCAL_QUARTER|LAST_FISCAL_QUARTER|NEXT_FISCAL_QUARTER|THIS_FISCAL_YEAR|LAST_FISCAL_YEAR|NEXT_FISCAL_YEAR)$/i;
    if (dateLiteralPattern.test(trimmed)) {
      return true;
    }
    // Check for ISO date format: YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (datePattern.test(trimmed)) {
      return true;
    }
    // Check for ISO datetime format: YYYY-MM-DDThh:mm:ss.sssZ or YYYY-MM-DDThh:mm:ssZ
    const datetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (datetimePattern.test(trimmed)) {
      return true;
    }
    return false;
  }

  /**
   * @description Clear error state
   */
  clearError() {
    this.error = null;
  }
}