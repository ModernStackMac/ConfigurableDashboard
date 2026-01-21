import { api, track, wire, LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { CloseActionScreenEvent } from "lightning/actions";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import { loadScript, loadStyle } from "lightning/platformResourceLoader";
import CODEMIRROR from "@salesforce/resourceUrl/codemirror";
import COMPONENT_TYPE_FIELD from "@salesforce/schema/HM_Dashboard_Component__c.HM_Type__c";
import loadDataSource from "@salesforce/apex/HM_DataSourceBuilderService.loadDataSource";
import saveDataSourceBasicInfo from "@salesforce/apex/HM_DataSourceBuilderService.saveDataSourceBasicInfo";
import getAccessibleObjects from "@salesforce/apex/HM_DataSourceBuilderService.getAccessibleObjects";
import getObjectFields from "@salesforce/apex/HM_DataSourceBuilderService.getObjectFields";
import executePreviewQuery from "@salesforce/apex/HM_DataSourceBuilderService.executePreviewQuery";

/**
 * @description Data Source Query Builder - Multi-step wizard for creating/editing Data Sources
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
      { label: "= THIS_WEEK", value: "date_this_week" },
      { label: "= THIS_MONTH", value: "date_this_month" },
      { label: "= THIS_YEAR", value: "date_this_year" },
      { label: "= LAST_N_DAYS:n", value: "date_last_n_days" },
      { label: "= NEXT_N_DAYS:n", value: "date_next_n_days" }
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
  @api recordId; // Record ID from Quick Action context (for editing existing records)

  // ==================== WIZARD STATE ====================
  currentStep = 1;

  // ==================== PAGE 1 STATE ====================
  @track formData = {
    name: "",
    active: true,
    dashboardComponentId: null,
    order: 1,
    rowIconName: ""
  };

  componentType = null;
  isIconNameConfirmed = false; // True after user blurs the icon name input

  // ==================== PAGE 2 STATE ====================
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

  // ==================== PAGE 3 STATE ====================
  @track whereConditions = [];
  conditionIdCounter = 0;
  
  // Owner filter state (mutually exclusive: 'me' | 'queue' | null)
  activeOwnerFilter = null;
  
  // Field search state per condition
  @track openFieldListConditionId = null;
  
  // Query limit (null means no limit)
  queryLimit = null;
  
  // Collapsible section states for Page 3
  isQuickFiltersExpanded = true;
  isConditionsExpanded = true;

  // CodeMirror state
  codeMirrorInitialized = false;
  codeMirrorEditor = null;

  // ==================== PAGE 4 STATE ====================
  @track queryResults = [];
  @track queryColumns = [];
  queryTotalCount = 0;
  isQueryLoading = false;
  queryError = null;
  isSoqlSectionExpanded = true;
  isResultsSectionExpanded = true;

  // ==================== COMMON STATE ====================
  isLoading = false;
  isSaving = false;
  error = null;

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
    // Load existing data if recordId is provided (from Quick Action context)
    if (this.recordId) {
      this.loadExistingData();
    }
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
   * @description Handle Next button click - navigates to next page
   */
  handleNext() {
    this.clearError();

    if (this.currentStep === 1) {
      if (!this.isPage1Valid) {
        return;
      }
      // Navigate to Page 2
      this.currentStep = 2;
      // Load objects for Page 2
      this.loadObjects();
      // Initialize CodeMirror (deferred to allow DOM to render)
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => {
        this.initializeCodeMirror();
      }, 100);
    } else if (this.currentStep === 2) {
      if (!this.isPage2Valid) {
        return;
      }
      // Navigate to Page 3 (Filters)
      this.currentStep = 3;
    } else if (this.currentStep === 3) {
      if (!this.isPage3Valid) {
        return;
      }
      // Navigate to Page 4 (Preview)
      this.currentStep = 4;
      // Execute preview query
      this.executeQueryPreview();
    }
  }

  /**
   * @description Handle Back button click - returns to previous page
   */
  handleBack() {
    this.clearError();
    if (this.currentStep === 2) {
      this.currentStep = 1;
    } else if (this.currentStep === 3) {
      this.currentStep = 2;
    } else if (this.currentStep === 4) {
      this.currentStep = 3;
    }
  }

  /**
   * @description Handle Save button click on final page - saves all wizard data
   */
  async handleSave() {
    // Page 4 is preview - validation already done on Page 3
    if (!this.isPage3Valid) {
      return;
    }

    this.isSaving = true;
    this.clearError();

    try {
      // Save all wizard data (Page 1 + Page 2 + Page 3)
      await saveDataSourceBasicInfo({
        recordId: this.recordId,
        name: this.formData.name.trim(),
        active: this.formData.active,
        dashboardComponentId: this.formData.dashboardComponentId,
        orderValue: this.formData.order,
        rowIconName: this.formData.rowIconName?.trim() || null
      });

      // TODO: Save Page 2 data (selected object, fields) when fields are added to Data Source
      // TODO: Save Page 3 data (WHERE conditions) when fields are added to Data Source

      this.showToast("Success", "Data Source saved successfully", "success");
      this.closePanel();
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
      this.aggregateFunction = null;
      this.aggregateFieldApiName = null;
      this.aggregateFieldSearchTerm = "";

      // Load fields for selected object
      this.loadFieldsForObject(obj.apiName);
    }
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

    this.updateSoqlPreview();
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
    setTimeout(() => {
      this.isAggregateFieldListOpen = false;
      this.aggregateFieldHighlightedIndex = -1;
    }, 200);
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
    // Reset field selection and aggregate state
    this.allFields = [];
    this.selectedFieldApiNames = [];
    this.fieldSearchTerm = "";
    this.aggregateFunction = null;
    this.aggregateFieldApiName = null;
    this.aggregateFieldSearchTerm = "";
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
    setTimeout(() => {
      this.isObjectListOpen = false;
      this.highlightedIndex = -1;
    }, 200);
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

  // ==================== PAGE 4 HANDLERS ====================

  /**
   * @description Toggle SOQL section expanded/collapsed
   */
  toggleSoqlSection() {
    this.isSoqlSectionExpanded = !this.isSoqlSectionExpanded;
  }

  /**
   * @description Toggle Results section expanded/collapsed
   */
  toggleResultsSection() {
    this.isResultsSectionExpanded = !this.isResultsSectionExpanded;
  }

  /**
   * @description Toggle Quick Filters section expanded/collapsed
   */
  toggleQuickFiltersSection() {
    this.isQuickFiltersExpanded = !this.isQuickFiltersExpanded;
  }

  /**
   * @description Toggle Conditions section expanded/collapsed
   */
  toggleConditionsSection() {
    this.isConditionsExpanded = !this.isConditionsExpanded;
  }

  /**
   * @description Handle refresh preview button click
   */
  handleRefreshPreview() {
    this.executeQueryPreview();
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
        // Aggregate query - execute directly since we need different handling
        await this.executeAggregatePreview(whereClause);
      }

    } catch (error) {
      this.queryError = error.body?.message || error.message || "Error executing preview query";
    } finally {
      this.isQueryLoading = false;
    }
  }

  /**
   * @description Execute aggregate query preview
   * @param {string} whereClause - WHERE clause string
   */
  async executeAggregatePreview(whereClause) {
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
   * @param {Event} event - Combobox change event
   */
  handleConditionConjunctionChange(event) {
    const conditionId = event.currentTarget.dataset.id;
    const conjunction = event.detail.value;
    
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
    setTimeout(() => {
      this.openFieldListConditionId = null;
    }, 200);
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
   * @description Helper to add a quick filter condition (kept for extensibility)
   * @param {Object} filterData - Filter condition data
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
      const dateLiteralOperators = ["date_today", "date_this_week", "date_this_month", "date_this_year"];
      const showValueInput = !nullOperators.includes(condition.operator) && !dateLiteralOperators.includes(condition.operator);
      const showNDaysInput = condition.operator === "date_last_n_days" || condition.operator === "date_next_n_days";
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
        noFieldsMatch
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
   * @description Get filtered field options with selection state for checkbox list
   * @returns {Array} Field options filtered by search term with selection state
   */
  get filteredFieldOptions() {
    const term = this.fieldSearchTerm.toLowerCase().trim();
    let fields = this.allFields;

    if (term) {
      fields = fields.filter(
        (f) => f.label.toLowerCase().includes(term) || f.apiName.toLowerCase().includes(term)
      );
    }

    return fields.map((f) => ({
      ...f,
      displayLabel: `${f.label} (${f.apiName})`,
      isSelected: this.selectedFieldApiNames.includes(f.apiName)
    }));
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

  // ==================== VALIDATION ====================

  /**
   * @description Validate form data
   * @returns {boolean} True if form is valid
   */
  validateForm() {
    // Validate Data Source Name
    if (!this.formData.name || this.formData.name.trim() === "") {
      this.showError("Validation Error", "Data Source Name is required");
      return false;
    }

    // Validate Dashboard Component
    if (!this.formData.dashboardComponentId) {
      this.showError("Validation Error", "Dashboard Component is required");
      return false;
    }

    return true;
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
      
      this.formData.name = data.name || "";
      this.formData.active = data.active !== undefined ? data.active : true;
      this.formData.dashboardComponentId = data.dashboardComponentId || null;
      this.formData.order = data.order !== undefined ? data.order : 1;
      this.formData.rowIconName = data.rowIconName || "";
      // componentType is set by the wire adapter when dashboardComponentId changes
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Unknown error occurred";
      this.showError("Load Error", `Failed to load existing data source: ${errorMessage}`);
    } finally {
      this.isLoading = false;
    }
  }

  // ==================== UI HELPERS ====================

  /**
   * @description Get modal title based on current step
   * @returns {string} Modal title
   */
  get modalTitle() {
    const prefix = this.recordId ? "Edit" : "Create";
    switch (this.currentStep) {
      case 1:
        return `${prefix} Data Source - Basic Info`;
      case 2:
        return `${prefix} Data Source - Select Object & Fields`;
      case 3:
        return `${prefix} Data Source - Filters`;
      default:
        return `${prefix} Data Source`;
    }
  }

  /**
   * @description Get current step value as string for progress indicator
   * @returns {string} Current step value
   */
  get currentStepValue() {
    return String(this.currentStep);
  }

  /**
   * @description Check if currently on Page 1
   * @returns {boolean} True if on Page 1
   */
  get isPage1() {
    return this.currentStep === 1;
  }

  /**
   * @description Check if currently on Page 2
   * @returns {boolean} True if on Page 2
   */
  get isPage2() {
    return this.currentStep === 2;
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
   * @description Check if currently on Page 3
   * @returns {boolean} True if on Page 3
   */
  get isPage3() {
    return this.currentStep === 3;
  }

  /**
   * @description Check if currently on Page 4 (Preview)
   * @returns {boolean} True if on Page 4
   */
  get isPage4() {
    return this.currentStep === 4;
  }

  /**
   * @description Check if SOQL section is expanded (for collapsible)
   * @returns {string} Icon name for SOQL section toggle
   */
  get soqlSectionIcon() {
    return this.isSoqlSectionExpanded ? "utility:chevrondown" : "utility:chevronright";
  }

  /**
   * @description Get icon for Results section toggle
   * @returns {string} Icon name
   */
  get resultsSectionIcon() {
    return this.isResultsSectionExpanded ? "utility:chevrondown" : "utility:chevronright";
  }

  /**
   * @description Get icon for Quick Filters section toggle
   * @returns {string} Icon name
   */
  get quickFiltersSectionIcon() {
    return this.isQuickFiltersExpanded ? "utility:chevrondown" : "utility:chevronright";
  }

  /**
   * @description Get icon for Conditions section toggle
   * @returns {string} Icon name
   */
  get conditionsSectionIcon() {
    return this.isConditionsExpanded ? "utility:chevrondown" : "utility:chevronright";
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
   * @description Check if Next button should be disabled
   * @returns {boolean} True if Next should be disabled
   */
  get isNextDisabled() {
    if (this.isSaving || this.isLoading) {
      return true;
    }
    if (this.currentStep === 1) {
      return !this.isPage1Valid;
    }
    if (this.currentStep === 2) {
      return !this.isPage2Valid;
    }
    if (this.currentStep === 3) {
      return !this.isPage3Valid;
    }
    return true;
  }

  /**
   * @description Check if Save button should be disabled (Page 4)
   * @returns {boolean} True if save should be disabled
   */
  get isSaveDisabled() {
    return this.isSaving || this.isLoading;
  }

  /**
   * @description Check if Next button should be shown
   * @returns {boolean} True if on Page 1, 2, or 3
   */
  get showNextButton() {
    return this.currentStep === 1 || this.currentStep === 2 || this.currentStep === 3;
  }

  /**
   * @description Check if Save button should be shown
   * @returns {boolean} True if on Page 4
   */
  get showSaveButton() {
    return this.currentStep === 4;
  }

  /**
   * @description Check if Back button should be shown
   * @returns {boolean} True if on Page 2, 3, or 4
   */
  get showBackButton() {
    return this.currentStep === 2 || this.currentStep === 3 || this.currentStep === 4;
  }

  /**
   * @description Check if Page 1 form is valid
   * @returns {boolean} True if Page 1 has all required fields filled and valid
   */
  get isPage1Valid() {
    return this.hasRequiredPage1Fields && this.isIconNameValidOrEmpty;
  }

  /**
   * @description Check if Page 2 is valid (object and at least one field selected)
   * @returns {boolean} True if Page 2 has required selections
   */
  get isPage2Valid() {
    // Object must be selected
    if (!this.page2Data.selectedObjectApiName) {
      return false;
    }

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
   * @description Check if Page 3 is valid (WHERE conditions are optional but must be complete if present)
   * @returns {boolean} True if Page 3 is valid (conditions optional, but if present must be valid)
   */
  get isPage3Valid() {
    // WHERE conditions are optional
    if (this.whereConditions.length === 0) {
      return true;
    }
    // If conditions exist, validate each one
    const nullOperators = ["is_null", "is_not_null"];
    const dateLiteralOperators = [
      "date_today",
      "date_this_week",
      "date_this_month",
      "date_this_year"
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
   * @description Check if Page 1 has all required fields
   * @returns {boolean} True if required fields are filled
   */
  get hasRequiredPage1Fields() {
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

    // Handle date literals
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

    // Handle LIKE operators
    if (condition.operator === "contains") {
      return `${field} LIKE '%${condition.value}%'`;
    }
    if (condition.operator === "starts_with") {
      return `${field} LIKE '${condition.value}%'`;
    }
    if (condition.operator === "ends_with") {
      return `${field} LIKE '%${condition.value}'`;
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

    // Handle INCLUDES/EXCLUDES for multipicklist
    if (condition.operator === "includes" || condition.operator === "excludes") {
      return `${field} ${operator} ('${condition.value}')`;
    }

    // Default: string value with quotes
    return `${field} ${operator} '${condition.value}'`;
  }

  /**
   * @description Check if SOQL preview should be shown
   * @returns {boolean} True if object and fields are selected
   */
  get showSoqlPreview() {
    return this.page2Data.selectedObjectApiName && this.selectedFieldApiNames.length > 0;
  }

  /**
   * @description Initialize CodeMirror editor
   */
  async initializeCodeMirror() {
    if (this.codeMirrorInitialized) {
      return;
    }

    try {
      await Promise.all([
        loadScript(this, CODEMIRROR + "/codemirror.js"),
        loadStyle(this, CODEMIRROR + "/codemirror.css")
      ]);

      // Check if CodeMirror loaded successfully (it uses ES modules, may not work directly)
      // eslint-disable-next-line no-undef
      if (typeof EditorView !== "undefined") {
        const container = this.template.querySelector(".codemirror-container");
        if (container) {
          // eslint-disable-next-line no-undef
          this.codeMirrorEditor = new EditorView({
            doc: this.generatedSoql,
            // eslint-disable-next-line no-undef
            extensions: [EditorView.editable.of(false)],
            parent: container
          });
          this.codeMirrorInitialized = true;
        }
      }
    } catch (error) {
      // CodeMirror failed to load - fallback to plain text display
      this.codeMirrorInitialized = false;
    }
  }

  /**
   * @description Update SOQL preview display
   */
  updateSoqlPreview() {
    if (this.codeMirrorEditor) {
      // Update CodeMirror content
      this.codeMirrorEditor.dispatch({
        changes: {
          from: 0,
          to: this.codeMirrorEditor.state.doc.length,
          insert: this.generatedSoql
        }
      });
    }
    // If CodeMirror not available, the template will use the generatedSoql getter directly
  }

  // ==================== UTILITY METHODS ====================

  /**
   * @description Close quick action panel
   */
  closePanel() {
    this.dispatchEvent(new CloseActionScreenEvent());
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
   * @description Clear error state
   */
  clearError() {
    this.error = null;
  }
}
