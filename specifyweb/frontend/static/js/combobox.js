define([
    'underscore', 'backbone', 'q', 'picklistcbx', 'readonlypicklistcbx', 'specifyapi', 'picklistmixins',
    'agenttypecbx', 'usertypecbx', 'picklisttypecbx', 'picklisttablecbx', 'picklistfieldcbx', 'treelevelcbx'
], function(_, Backbone, Q, PickListCBX, ReadOnlyPickListCBX, api, mixins,
            AgentTypeCBX, UserTypeCBX, PickListTypeCBX, PickListTableCBX,
            PickListFieldCBX, TreeLevelCBX) {
    "use strict";

    function getCBX(options, resource, field) {
        _.extend(options, {
            resource: resource,
            field: field,
            remote: resource !== options.model
        });

        if (resource.specifyModel.name === 'Agent' && field.name === 'agentType') {
            return new AgentTypeCBX(options);
        }

        if (resource.specifyModel.name === 'PickList' && options.fieldName === 'typesCBX') {
            return new PickListTypeCBX(options);
        }

        if (resource.specifyModel.name === 'PickList' && options.fieldName === 'tablesCBX') {
            return new PickListTableCBX(options);
        }

        if (resource.specifyModel.name === 'PickList' && options.fieldName === 'fieldsCBX') {
            return new PickListFieldCBX(options);
        }

        if (options.fieldName === 'definitionItem') {
            return new  TreeLevelCBX(options);
        }

        if (!field) {
            throw "can't setup picklist for unknown field " + options.model.specifyModel.name + "." + options.fieldName;
        }

        options.pickListName || (options.pickListName = field.getPickList());

        if (options.pickListName === 'UserType') {
            return new UserTypeCBX(options);
        }
        if (!options.pickListName)
            throw "can't determine picklist for field " + resource.specifyModel.name + "." + field.name;

        return Q(api.getPickListByName(options.pickListName))
            .then(function(picklist) {
                options.pickList = picklist;

                options.limit = picklist.get('sizelimit');
                if (options.limit < 1) options.limit = 0;
                var Control = picklist.get('readonly') ? ReadOnlyPickListCBX : PickListCBX;

                switch (picklist.get('type')) {
                case 0: // items in picklistitems table
                    return new (Control.extend(mixins.userDefined))(options);

                case 1: // items are objects from a table
                    // This has to be readonly.
                    return new (ReadOnlyPickListCBX.extend(mixins.fromTable))(options);

                case 2: // items are fields from a table
                    return new (Control.extend(mixins.fromField))(options);

                default:
                    throw new Error('unknown picklist type: ' + picklist.get('type'));
                }
            });
    }

    return Backbone.View.extend({
        __name__: "ComboBoxView",
        initialize: function() {
            var options = {
                el: this.el,
                model: this.model,
                fieldName: this.$el.attr('name'),
                pickListName: this.$el.data('specify-picklist')
            };

            this.cbxPromise = Q(this.model.getResourceAndField(options.fieldName))
                .spread(getCBX.bind(null, options));
        },
        render: function() {
            this.cbxPromise.invoke('render').done();
            return this;
        }
    });
});