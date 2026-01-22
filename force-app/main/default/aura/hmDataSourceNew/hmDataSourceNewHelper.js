/* eslint-disable no-unused-expressions */
({
    navigateToObjectHome: function(component) {
        var navService = component.find("navService");
        var pageRef = {
            type: "standard__objectPage",
            attributes: {
                objectApiName: "HM_Dashboard_Data_Source__c",
                actionName: "list"
            },
            state: {
                filterName: "Recent"
            }
        };
        navService.navigate(pageRef);
    },
    
    navigateToRecord: function(component, recordId) {
        var navService = component.find("navService");
        var pageRef = {
            type: "standard__recordPage",
            attributes: {
                recordId: recordId,
                actionName: "view"
            }
        };
        navService.navigate(pageRef);
    }
})