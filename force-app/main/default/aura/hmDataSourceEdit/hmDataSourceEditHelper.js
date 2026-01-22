/* eslint-disable no-unused-expressions */
({
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