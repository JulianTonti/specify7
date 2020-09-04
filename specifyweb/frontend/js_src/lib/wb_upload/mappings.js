"use strict";
const auto_mapper = require('./auto_mapper.js');
const upload_plan_converter = require('./upload_plan_converter.js');
const tree_helpers = require('./tree_helpers.js');
const dom_helper = require('./dom_helper.js');
const data_model_handler = require('./data_model_handler.js');
const html_generator = require('./html_generator.js');

const mappings = {


	//CONFIGURATORS

	/*
	* Constructor that finds needed elements, calls constructors for dependencies and fetches data model
	* */
	constructor: () => {


		//FINDING ELEMENTS

		// column data model
		mappings.title__table_name = document.getElementById('title__table_name');
		mappings.button__change_table = document.getElementById('button__change_table');
		mappings.list__tables = document.getElementById('list__tables');
		mappings.list__data_model = document.getElementById('list__data_model');
		mappings.lines = mappings.list__data_model.getElementsByTagName('input');


		// column controls
		mappings.button__map = document.getElementById('button__map');
		mappings.button__delete = document.getElementById('button__delete');


		// column headers
		mappings.list__headers = document.getElementById('list__headers');
		mappings.button__new_field = document.getElementById('button__new_field');
		mappings.control_line__new_header = document.getElementById('control_line__new_header');
		mappings.control_line__new_static_header = document.getElementById('control_line__new_static_header');
		mappings.headers = mappings.list__headers.getElementsByTagName('input');


		//CONFIG
		mappings.hide_hidden_fields = true;
		mappings.need_to_run_auto_mapper = true;
		mappings.raw_headers = [];
		mappings.base_table_name = undefined;
		mappings.selected_field = undefined;
		mappings.ranks = {};

		mappings.reference_indicator = '> ';
		mappings.level_separator = '_';
		mappings.friendly_level_separator = ' > ';
		mappings.reference_symbol = '#';
		mappings.tree_symbol = '$';


		//INITIALIZATION

		//build list of tables to exclude
		mappings.tables_to_hide = [
			'definition',
			'definitionitem',
			'geographytreedef',
			'geologictimeperiodtreedef',
			'treedef'
		];
		mappings.tables_to_hide = [...mappings.tables_to_hide, ...data_model_handler.get_list_of_hierarchy_tables()];

		//fetch data model
		data_model_handler.constructor(mappings.ranks, mappings.tables_to_hide);
		data_model_handler.fetch((data_model_html, tables) => {

			mappings.list__tables.innerHTML = data_model_html;

			auto_mapper.constructor(tables, mappings.ranks, mappings.reference_symbol, mappings.tree_symbol);

			mappings.new_header_id = 1;
			mappings.tables = tables;


			//initialize dependencies
			upload_plan_converter.constructor(
				() => {
					return mappings.base_table_name;
				},
				(base_table_name) => {
					mappings.base_table_name = base_table_name;
				},
				mappings.tree_symbol,
				mappings.reference_symbol,
				mappings.get_mappings_tree,
				mappings.ranks,
				mappings.tables,
			);

		});


		//setting event listeners

		mappings.button__change_table.addEventListener('click', mappings.reset_table);

		mappings.button__map.addEventListener('click', mappings.map_field_callback);
		mappings.button__delete.addEventListener('click', mappings.unmap_field_callback);

		mappings.control_line__new_header.addEventListener('change', mappings.change_selected_header);
		mappings.control_line__new_static_header.addEventListener('change', mappings.change_selected_header);

		document.getElementById('checkbox__toggle_hidden_fields').addEventListener('change', () => {
			mappings.hide_hidden_fields = !mappings.hide_hidden_fields;
			mappings.cycle_though_fields();
		});

		mappings.list__data_model.addEventListener('change', (event) => {
			if (event.target && event.target.classList.contains('radio__field'))
				mappings.change_selected_field(event);
			else if (event.target && event.target.tagName === 'SELECT')
				mappings.change_option_field(event);
		});

		mappings.list__data_model.addEventListener('focus', (event) => {
			if (event.target && event.target.tagName === 'SELECT')
				mappings.change_option_field(event);
		});

		mappings.list__headers.addEventListener('change', (event) => {
			if (event.target && event.target['classList'].contains('radio__header'))
				mappings.change_selected_header(event);
			else if (event.target && event.target['tagName'] === 'TEXTAREA')
				mappings.changes_made = true;
		});

		mappings.list__tables.addEventListener('change', (event) => {
			if (event.target && event.target['classList'].contains('radio__table'))
				mappings.set_table(event);
		});

		window.addEventListener('beforeunload', function (e) {//stops page from reloading if there is mapping in progress
			if (typeof mappings.list__tables_scroll_postion !== "undefined") {
				e.preventDefault();
				e.returnValue = 'Are you sure you want to discard creating mapping for this dataset?';//this message won't be displayed in most browsers
			} else
				delete e['returnValue'];
		});


	},


	/*
	* Maps a field
	* @param {string} mapping_type - existing_header / new_header / new_static_header
	* @param {mixed} header_element - {DOMElement} header_element - <input type="radio"> if mapping type is `existing_header`
	* 								  {string} header_name - Name of the header if mapping type is `new_header`
	* 								  {string} static_value - Value of a static field if mapping type is `static_value`
	* @param {array} mapping_path - Mapping path array
	* @return {DOMElement} Returns header_element if mapping type is `existing_header`
	* 					   Else, returns <input type="radio"> for a newly created element
	* */
	map_field: (mapping_type, header_element, mapping) => {

		let heading_mapping;

		if (mapping_type === 'existing_header') {
			const label = header_element.parentElement;
			heading_mapping = dom_helper.get_mappping_friendly_name_element(label);
			heading_mapping.classList.remove('undefined');
		} else {

			const header_line__element = document.createElement('div');
			mappings.list__headers.appendChild(header_line__element);

			if (mapping_type === 'new_header') {
				let header_name;

				if (header_element === '')
					header_name = 'New Column ' + mappings.new_header_id;
				else
					header_name = header_element;

				header_line__element.innerHTML += html_generator.new_header(header_name, 'mapped_header');

				mappings.new_header_id++;
			} else if (mapping_type === 'new_static_header')
				header_line__element.innerHTML += html_generator.new_header(header_element, 'static_header');

			const new_header_label = mappings.list__headers.lastElementChild;
			header_element = dom_helper.get_control_element(new_header_label)[0];
			header_element.checked = true;
			heading_mapping = dom_helper.get_mappping_friendly_name_element(new_header_label);

		}

		const mapping_path = mapping.join(mappings.level_separator);

		header_element.setAttribute('data-path', mapping_path);

		if (mapping.length === 1 && typeof mappings.selected_field !== "undefined")
			mappings.selected_field.setAttribute('disabled', '');

		const friendly_field_path_array = mappings.get_friendly_field_path(mapping.slice());
		const friendly_field_path = friendly_field_path_array.join(mappings.friendly_level_separator);

		heading_mapping.innerText = mappings.get_friendly_field_path_preview(friendly_field_path_array, mapping);
		heading_mapping.setAttribute('title', friendly_field_path);

		return heading_mapping;

	},

	/*
	* Implements array of mappings
	* @param {array} array_of_mappings - Array of arrays of mappings like [mapping_type,header_name,mapping_path] where
	* 									 @param {string} mapping_type - existing_header / new_header / new_static_header
	* 									 @param {mixed} header_element - {DOMElement} header_element - <input type="radio"> if mapping type is `existing_header`
	* 								  									 {string} header_name - Name of the header if mapping type is `new_header`
	* 								  									 {string} static_value - Value of a static field if mapping type is `static_value`
	* 									 @param {array} mapping_path - Mapping path array
	* */
	implement_array_of_mappings: (array_of_mappings) => {

		if (array_of_mappings.length === 0)
			return false;

		const base_table_columns = [];

		Object.values(array_of_mappings).forEach((header_data) => {

			let header;
			let mapping;
			let mapping_type;
			[mapping_type, header, mapping] = header_data;

			if (mapping_type === 'existing_header') {
				const position = mappings.raw_headers.indexOf(header);
				header = mappings.headers[position];
			}

			mappings.map_field(mapping_type, header, mapping);

			//disable base table columns
			if (mapping.length === 1)
				base_table_columns.push(mapping[0]);

		});

		Object.values(mappings.lines).forEach((radio) => {
			const data_field = dom_helper.get_field_name(radio);
			if (data_field !== 'relationship' && base_table_columns.indexOf(data_field) !== -1)
				radio.setAttribute('disabled', '');
		});

		//make all checkboxes unchecked again
		mappings.headers[0].checked = true;
		mappings.headers[0].checked = false;

		mappings.changes_made = true;
		mappings.update_buttons();

	},


	//SETTERS

	/* Select table
	* @param {Object} event - event object. Only event.target property is used
	* */
	set_table: (event) => {

		const radio = event.target;
		const table_name = dom_helper.get_table_name(radio);
		const table_data = mappings.tables[table_name];

		mappings.list__tables_scroll_postion = mappings.list__tables.parentElement.scrollTop;
		mappings.list__tables.parentElement.scrollTop = 0;
		mappings.list__tables.style.display = 'none';
		mappings.list__data_model.style.display = '';

		mappings.button__change_table.style.display = '';

		mappings.title__table_name.classList.remove('undefined');
		mappings.title__table_name.innerText = mappings.tables[table_name]['friendly_table_name'];

		mappings.selected_table = radio;

		let rows_html = '';

		if (typeof mappings.ranks[table_name] !== "undefined") {//table is a tree

			const ranks = mappings.ranks[table_name];

			Object.keys(ranks).forEach((rank_name) => {
				rows_html += html_generator.new_base_field(mappings.tree_symbol + rank_name, mappings.reference_indicator + rank_name, true);
			});

		} else {

			const fields = Object.keys(mappings.tables[table_name]['fields']);
			const relationships = Object.keys(mappings.tables[table_name]['relationships']);

			const temp_table_rows = fields.concat(relationships).sort();

			temp_table_rows.forEach((row_key) => {

				let class_append = [];
				let row_name;

				if (typeof table_data['fields'][row_key] !== 'undefined') {
					row_name = table_data['fields'][row_key]['friendly_field_name'];

					if (table_data['fields'][row_key]['is_required'])
						class_append.push('required');
				} else {
					row_name = mappings.reference_indicator + table_data['relationships'][row_key]['friendly_relationship_name'];
					class_append.push('relationship');
				}

				class_append = class_append.join(' ');

				rows_html += html_generator.new_base_field(row_key, row_name, false, class_append);

			});

		}


		mappings.base_table_name = table_name;
		mappings.list__data_model.innerHTML = rows_html;


		//if header is checked by browser, update selected_header
		function select_header(header) {
			if (header.checked) {
				mappings.selected_header = header;
				return false;
			}
		}

		Object.values(mappings.headers).forEach(select_header);
		select_header(mappings.control_line__new_header);
		select_header(mappings.control_line__new_static_header);


		mappings.tree = {};
		mappings.changes_made = true;

		if (mappings.need_to_run_auto_mapper) {
			const mappings_object = auto_mapper.map(mappings.raw_headers, mappings.base_table_name);
			const array_of_mappings = [];
			Object.keys(mappings_object).forEach((header_name) => {
				const mapping_path = mappings_object[header_name];
				array_of_mappings.push(['existing_header', header_name, mapping_path]);
			});
			mappings.need_to_run_auto_mapper = false;
			mappings.implement_array_of_mappings(array_of_mappings);
		}

	},

	/*
	* Updates the list of headers
	* @param {array} [headers=[]] - List of headers as strings
	* @param {string} [upload_plan=null] - Upload plan as string
	* @param {bool} [headers_defined=true] - Whether CSV file had headers in the first line
	* */
	set_headers: (headers = [], upload_plan = null, headers_defined = true) => {

		let headers_html = '';

		mappings.need_to_run_auto_mapper = headers_defined;//don't run auto mapper if CSV file doesn't have headers

		mappings.raw_headers = headers;

		headers.forEach((header) => {
			headers_html += html_generator.new_header(header, 'unmapped_header');
		});

		mappings.list__headers.innerHTML = headers_html;

		tree_helpers.raw_headers = mappings.raw_headers;

		let mappings_tree = '';
		if (upload_plan !== null) {
			const upload_plan_object = JSON.parse(upload_plan);

			const base_table_name = upload_plan_object['baseTableName'];
			const list_of_tables = Object.keys(mappings.tables);
			const table_position = list_of_tables.indexOf(base_table_name);
			const label = mappings.list__tables.children[table_position];
			const radio = dom_helper.get_control_element(label)[0];
			mappings.need_to_run_auto_mapper = false;

			mappings.set_table({target: radio});

			mappings_tree = upload_plan_converter.upload_plan_to_mappings_tree(upload_plan_object);
			const array_of_mappings = tree_helpers.mappings_tree_to_array_of_mappings(mappings_tree);
			mappings.implement_array_of_mappings(array_of_mappings);
		}

	},

	/*
	* Resets the currently mapped fields and presents the option to chose base table again
	* */
	reset_table: () => {

		if (typeof mappings.selected_table === "undefined")
			return;

		mappings.selected_table.checked = false;
		mappings.selected_table = undefined;

		const header_mappings = mappings.list__headers.getElementsByClassName('mapping');

		Object.values(header_mappings).forEach((mapping) => {
			mapping.outerHTML = html_generator.unmapped_header_mapping;
		});

		mappings.title__table_name.classList.add('undefined');
		mappings.title__table_name.innerText = '';

		mappings.list__tables.style.display = '';
		mappings.list__data_model.style.display = 'none';

		if (typeof mappings.list__tables_scroll_postion !== "undefined") {
			setTimeout(() => {
				mappings.list__tables.parentElement.scrollTop = mappings.list__tables_scroll_postion;
				mappings.list__tables_scroll_postion = undefined;
			}, 0);
		}

		mappings.button__change_table.style.display = 'none';
		mappings.need_to_run_auto_mapper = true;

	},


	//FUNCTIONS

	/*
	* Callback for when user presses the `map` button
	* This function calls `map_field` with necessary parameters
	* */
	map_field_callback: () => {

		if (typeof mappings.selected_field === "undefined" ||
			dom_helper.is_field_disabled(mappings.selected_field)
		)
			return;

		let mapping_type;
		let header;
		let mapping;

		const label = mappings.selected_header.parentElement;
		let heading_mapping = dom_helper.get_mappping_friendly_name_element(label);

		header = mappings.selected_header;
		mapping = mappings.get_field_path();

		if (typeof heading_mapping === "undefined") {
			mapping_type = dom_helper.get_header_name(mappings.selected_header);
			header = '';
		} else {
			mapping_type = 'existing_header';
			mappings.unmap_field_callback();
		}

		mappings.selected_header = mappings.map_field(mapping_type, header, mapping);

		mappings.changes_made = true;
		mappings.update_buttons();
		mappings.update_fields();

	},

	/*
	* Updates the status (enabled/disabled) of each field
	* @param {DOMElement} first_line - first line of a mapping path (e.x LABELs only, no DIVs)
	* @param {array} [mappings_array=[]] - Update the field only if its mappings path = mappings_array. Checks regardless if mappings_array=[]
	* */
	update_fields: (first_line, mappings_array = []) => {

		let field_path;
		if (typeof first_line === "undefined") {
			let last_element = mappings.selected_field;
			if (typeof last_element === "undefined")
				last_element = mappings.lines[0];
			const last_line = dom_helper.get_line_element(last_element);
			first_line = dom_helper.get_first_line(last_line);
			field_path = mappings.get_field_path();
		} else {
			const last_line = dom_helper.get_last_line(first_line);
			const control_element = dom_helper.get_control_element(last_line)[0];
			field_path = mappings.get_field_path(control_element);
		}

		if (mappings_array.length !== 0 && field_path[0] !== mappings_array[0])
			return;

		const mapped_children_count = field_path.length;

		let line = first_line;
		for (let i = 0; i < mapped_children_count; i++) {

			const control_element = dom_helper.get_control_element(line)[0];

			if (i === 0) {
				if (!control_element.classList.contains('tree'))
					mappings.change_selected_field({target: control_element});
			} else {
				control_element.value = field_path[i];
				mappings.change_option_field({target: control_element});
			}

			line = line.nextElementSibling;

		}

	},

	/*
	* Callback for when users presses the `unmap` button
	* */
	unmap_field_callback: () => {

		const label = mappings.selected_header.parentElement;
		const heading_mapping = dom_helper.get_mappping_friendly_name_element(label);

		const mappings_path = dom_helper.get_mapping_path(mappings.selected_header);

		if (mappings_path === null)
			return;

		const mappings_array = mappings_path.split(mappings.level_separator);

		heading_mapping.classList.add('undefined');
		mappings.selected_header.removeAttribute('data-path');
		heading_mapping.removeAttribute('title');
		heading_mapping.innerText = '';

		mappings.changes_made = true;

		//go through each field and update it's status
		mappings.cycle_though_fields(mappings_array, mappings_path);

		mappings.update_buttons();


	},


	//GETTERS

	/*
	* Puts HTML for a particular relationship line into `current_line` outerHTML
	* @param {string} table_name - Official target table name (from data model)
	* @param {string{ previous_table - Official name for the current table (a.k.a parent of to table_name) (from data model)
	* @param {string} foreign_name - Name of this relationship in previous_table
	* @param {DOMElement} current_line - Element which would have it's outerHTML replaced with the result of this function
	* @param {bool} index - A terrible name for a variable that tells whether to check if this relationship is -to-many or a tree. If set to false, relationship would be treated as -to-one
	*
	* */
	get_html_for_table_fields: (table_name, previous_table, foreign_name, current_line, index = false) => {

		const result_fields = [];


		let mapped_nodes = mappings.get_mapped_children(current_line);

		const ranks = mappings.ranks[table_name];
		if (index === false) {

			if (typeof ranks !== "undefined")
				Object.keys(ranks).forEach((rank_name) => {
					result_fields.push([mappings.tree_symbol + rank_name, mappings.reference_indicator + rank_name, true]);
				});

			let relationship_type;
			if (previous_table !== '')
				relationship_type = mappings.tables[previous_table]['relationships'][foreign_name]['type'];

			if (result_fields.length === 0 && (relationship_type === 'one-to-many' || relationship_type === 'many-to-many')) {
				let mapped_nodes_count = mapped_nodes.length;

				if (mapped_nodes === false)
					mapped_nodes_count = 0;

				const friendly_table_name = mappings.tables[table_name]['friendly_table_name'];

				for (let i = 1; i < mapped_nodes_count + 2; i++)
					result_fields.push([mappings.reference_symbol + i, i + '. ' + friendly_table_name, true]);
			}

		}

		if (result_fields.length === 0) {

			const rows = {};

			Object.keys(mappings.tables[table_name]['fields']).forEach((field_key) => {

				const field_data = mappings.tables[table_name]['fields'][field_key];
				const is_field_hidden = field_data['is_hidden'];

				if (is_field_hidden && mappings.hide_hidden_fields)
					return true;

				const field_name = field_data['friendly_field_name'];
				const enabled = !mapped_nodes.includes(field_key);
				rows[field_name] = [field_key, enabled, 'field'];

			});

			Object.keys(mappings.tables[table_name]['relationships']).forEach((relationship_key) => {
				const relationship_data = mappings.tables[table_name]['relationships'][relationship_key];

				const is_field_hidden = relationship_data['is_hidden'];
				if (is_field_hidden && mappings.hide_hidden_fields)
					return true;

				const relationship_name = relationship_data['friendly_relationship_name'];
				const enabled = //disables circular relationships
					relationship_data['foreign_name'] !== foreign_name ||
					relationship_data['table_name'] !== previous_table;
				rows[relationship_name] = [relationship_key, enabled, 'relationship'];
			});

			Object.keys(rows).sort().forEach((row_name) => {

				let row_key;
				let row_enabled;
				let row_type;

				[row_key, row_enabled, row_type] = rows[row_name];

				if (row_type === 'relationship')
					row_name = mappings.reference_indicator + row_name;

				if (//TODO: remove this to enable all fields for trees (once upload plan starts supporting that)
					typeof mappings.ranks[table_name] !== "undefined" &&
					row_name !== 'Name'
				)
					row_enabled = false;

				result_fields.push([row_key, row_name, row_enabled]);

			});
		}

		return html_generator.new_relationship_fields(table_name, result_fields);

	},

	/*
	* Get the list of elements of this line that are mapped
	* @param {DOMElement} current_line - select that would be used as a basis for checking
	* @return {array} Returns array of fields that are already mapped and should be disabled
	* */
	get_mapped_children: (current_line) => {
		const previous_line = current_line.previousElementSibling;

		const previous_element = dom_helper.get_control_element(previous_line)[0];

		const mappings_array = mappings.get_field_path(previous_element);
		const node_mappings_tree = tree_helpers.array_to_tree(mappings_array);
		const full_mappings_tree = mappings.get_mappings_tree();

		const tree = tree_helpers.traverse_tree(full_mappings_tree, node_mappings_tree);

		return Object.keys(tree);

	},

	get_field_path: (target_field = undefined) => {

		const path = [];

		if (typeof target_field === "undefined") {
			if (typeof mappings.selected_field === "undefined")
				return '';
			target_field = mappings.selected_field;
		}

		let line = dom_helper.get_line_element(target_field);

		while (true) {

			let control_element;
			let control_element_type;

			[control_element, control_element_type] = dom_helper.get_control_element(line);

			if (control_element_type === 'select')
				path.push(control_element.value);
			else {
				path.push(dom_helper.get_field_name(control_element));
				break;
			}

			line = line.previousElementSibling;

		}


		if (path.length === 0 && path[0] === null)
			return [];

		return path.reverse();

	},

	/*
	* Turns a mapping path (array) into a friendly mapping path (array)
	* @param {array} path - mapping path
	* @param {array} [friendly_names=[]] - Used by recursion to store intermediate result
	* @param {string} [table_name=''] - Used by recursion to store temporary data
	* */
	get_friendly_field_path: (path, friendly_names = [], table_name = '') => {

		//return result after path is processed
		if (path.length === 0)
			return friendly_names;

		//detects the first execution
		if (friendly_names.length === 0) {
			const base_table_friendly_name = mappings.tables[mappings.base_table_name]['friendly_table_name'];
			return mappings.get_friendly_field_path(path, [base_table_friendly_name], mappings.base_table_name);
		}

		const field_name = path.shift();

		//detects a -to-many object
		if (field_name.substr(0, mappings.reference_symbol.length) === mappings.reference_symbol) {
			friendly_names.push(field_name);
			return mappings.get_friendly_field_path(path, friendly_names, table_name);
		}

		//detects a field
		const field_data = mappings.tables[table_name]['fields'][field_name];
		if (typeof field_data !== "undefined") {
			const field_name = field_data['friendly_field_name'];
			friendly_names.push(field_name);
			return friendly_names;
		}

		//detects a tree
		if (field_name.substr(0, mappings.tree_symbol.length) === mappings.tree_symbol) {
			const new_rank_name = field_name.substr(mappings.tree_symbol.length);
			friendly_names.push(new_rank_name);
			return mappings.get_friendly_field_path(path, friendly_names, table_name);
		}

		//detects a relationship
		const relationship = mappings.tables[table_name]['relationships'][field_name];
		friendly_names.push(relationship['friendly_relationship_name']);
		table_name = relationship['table_name'];
		return mappings.get_friendly_field_path(path, friendly_names, table_name);

	},

	/*
	* Turns the result of get_field_path and get_friendly_field_path into a human-friendly path preview that can be used as a text for header's label
	* @param {array} friendly_field_path - result of get_friendly_field_path
	* @param {array} field_path - result of get_field_path
	* @return {string} - human-friendly path preview that can be used as a text for header's label
	* */
	get_friendly_field_path_preview: (friendly_field_path, field_path) => {
		friendly_field_path = friendly_field_path.splice(1);//remove the base table from the friendly path
		const path_length = friendly_field_path.length;

		if (path_length === 0 || path_length !== field_path.length)
			return '';

		let result = friendly_field_path[path_length - 1];

		if (path_length === 1)
			return result;

		//if base table is a tree and path length == 2
		if (path_length === 2 && typeof mappings.ranks[mappings.base_table_name] !== "undefined")
			return friendly_field_path[0] + ' ' + result;//e.x. for `Kingdom > Name` return `Kingdom Name`

		//detect previous field being a -to-many object
		if (friendly_field_path[path_length - 2].substr(0, mappings.reference_symbol.length) === mappings.reference_symbol)
			return friendly_field_path[path_length - 2] + ' ' + result;//e.x. for `... > #1 > Name` return `#1 Name`

		//detect previous field being a tree rank
		if (field_path[path_length - 2].substr(0, mappings.tree_symbol.length) === mappings.tree_symbol)
			return field_path[path_length - 2].substr(mappings.tree_symbol.length) + ' ' + result;//e.x. for `$Kingdom > Name` return `Kingdom Name`


		return result;
	},

	/*
	* Traverses the existing mapping to create a mappings tree
	* @return {object} Returns mappings tree
	* */
	get_mappings_tree: () => {

		if (!mappings.changes_made)
			return mappings.tree;

		let tree = {};

		Object.values(mappings.headers).forEach((header) => {

			const raw_path = dom_helper.get_mapping_path(header);

			if (raw_path == null)
				return true;

			let path = [];

			raw_path.split(mappings.level_separator).forEach((path_part) => {
				path.push(path_part);
			});

			const next_heading_line = header.nextElementSibling;

			let header_type;
			let header_control_element;
			[header_control_element, header_type] = dom_helper.get_header_control_element(next_heading_line);

			if (header_type === 'static')
				path.push({'static': header_control_element.value});
			else
				path.push(header_control_element.innerText);

			const branch = tree_helpers.array_to_tree(path);
			tree = tree_helpers.deep_merge_object(tree, branch);

		});

		mappings.tree = tree;
		mappings.changes_made = false;


		return tree;

	},


	//CHANGE CALLBACKS

	/*
	* Callback for handling change to selected header
	* */
	change_selected_header: (event) => {
		mappings.selected_header = event.target;
		mappings.update_buttons();

	},

	/*
	* Callback for handling change to direct child of a base table
	* */
	change_selected_field: (event) => {

		const radio = event.target;
		const label = radio.parentElement;
		const field_key = dom_helper.get_field_name(radio);

		mappings.selected_field = radio;

		dom_helper.close_open_lists(mappings.list__data_model);

		if (mappings.is_selected_field_in_relationship()) {

			const select_line = document.createElement('div');
			mappings.list__data_model.insertBefore(select_line, label.nextElementSibling);

			let target_table_name;
			let index = field_key.substr(0, mappings.tree_symbol.length) === mappings.tree_symbol;
			if (index)
				target_table_name = mappings.base_table_name;
			else {
				const relationship = mappings.tables[mappings.base_table_name]['relationships'][field_key];
				target_table_name = relationship['table_name'];
			}

			select_line.outerHTML = mappings.get_html_for_table_fields(target_table_name, mappings.base_table_name, field_key, select_line, index);
			dom_helper.get_control_element(label.nextElementSibling)[0].checked = true;

		}

		mappings.update_buttons();

	},

	/*
	* Callback for handling the change to the value of <select>
	* */
	change_option_field: (event) => {
		const select = event.target;
		const value = select.value;
		const label = select.parentElement;
		const line = label.parentElement;
		const radio = dom_helper.get_control_element(line)[0];
		radio.checked = true;

		mappings.selected_field = select;

		let element = line.nextElementSibling;//remove all <select> elements following this one
		while (true) {

			if (element === null || !element.classList.contains('table_relationship'))
				break;

			let next_element = element.nextElementSibling;

			mappings.list__data_model.removeChild(element);

			element = next_element;
		}


		if (mappings.is_selected_field_in_relationship() && value !== '' && value !== "0") {

			const select_line = document.createElement('div');
			mappings.list__data_model.insertBefore(select_line, line.nextElementSibling);

			let current_table_name;
			let relationship_key;
			let index = false;

			if (value.substr(0, mappings.tree_symbol.length) === mappings.tree_symbol) {//previous_selected_field was part of a tree structure

				const table_name = dom_helper.get_relationship_name(select);
				select_line.outerHTML = mappings.get_html_for_table_fields(table_name, '', '', select_line, true);

			} else {

				if (value.substr(0, mappings.reference_symbol.length) === mappings.reference_symbol) {//previous_selected_field was a o-m or m-m multiple

					const parent_line = line.previousElementSibling;
					let parent_control_element;
					let parent_control_element_type;
					[parent_control_element, parent_control_element_type] = dom_helper.get_control_element(parent_line);

					if (parent_control_element_type === 'select') {
						current_table_name = dom_helper.get_relationship_name(parent_control_element);
						relationship_key = parent_control_element.value;
					} else {
						current_table_name = mappings.base_table_name;
						relationship_key = dom_helper.get_field_name(parent_control_element);
					}

					index = value;

				} else {
					current_table_name = dom_helper.get_relationship_name(select);
					relationship_key = value;
				}

				const relationship = mappings.tables[current_table_name]['relationships'][relationship_key];
				const target_table_name = relationship['table_name'];
				select_line.outerHTML = mappings.get_html_for_table_fields(target_table_name, current_table_name, relationship_key, select_line, index);

			}


			dom_helper.get_control_element(line.nextElementSibling)[0].checked = true;

		}

		mappings.update_buttons();

	},


	//HELPERS

	//TODO: investigate this function. It looks very sketchy...
	/*
	* Cycles through all fields and updates them as needed
	* Used when the user unmaps a field
	* @param {array} [mappings_array=[]] - the mappings path that was used by the mapped field
	* @param {string} [mappings_path=''] - same as mappings_array but as a string
	* */
	cycle_though_fields: (mappings_array = [], mappings_path = '') => {

		const lines = Object.values(mappings.lines);
		const lines_count = lines.length;
		for (let i = 0; i < lines_count; i++) {

			const data_field = dom_helper.get_field_name(lines[i]);
			if (data_field !== 'relationship') {//field is not a relationship

				if (i + 1 < lines_count && dom_helper.get_field_name(lines[i + 1]) === 'relationship') {//next field exists and is relationship
					const first_line = lines[i].parentElement;
					mappings.update_fields(first_line, mappings_array);

				} else if (mappings_array.length === 1 && mappings_path === data_field)//re_enable base table field if it was unmapped
					lines[i].removeAttribute('disabled');

			}

		}

	},

	/*
	* Checks whether selected field is a relationship
	* @return {bool} Whether selected field is a relationship
	* */
	is_selected_field_in_relationship: () => {

		if (mappings.selected_field.tagName === 'INPUT') {

			const label = mappings.selected_field.parentElement;
			const name = dom_helper.get_friendly_field_name(label);

			return name.innerText.substr(0, mappings.reference_indicator.length) === mappings.reference_indicator;

		}

		return mappings.selected_field.value[0] === mappings.reference_symbol ||
			mappings.selected_field.value[0] === mappings.tree_symbol ||
			mappings.selected_field.selectedIndex === -1 ||
			mappings.selected_field.options[mappings.selected_field.selectedIndex].text.substr(0, mappings.reference_indicator.length) === mappings.reference_indicator;

	},

	/*
	* Updates the state (enabled / disabled) of map and unmap buttons
	* */
	update_buttons: () => {

		mappings.button__map.disabled =
			typeof mappings.selected_header === "undefined" ||
			typeof mappings.selected_field === "undefined" ||
			dom_helper.is_field_disabled(mappings.selected_field) ||
			(
				mappings.selected_field.tagName === 'SELECT' &&
				dom_helper.is_field_disabled(mappings.selected_field.options[mappings.selected_field.selectedIndex])
			) ||
			mappings.is_selected_field_in_relationship() ||
			mappings.selected_field.value === "0";

		if (typeof mappings.selected_header === "undefined")
			mappings.button__delete.disabled = true;
		else {
			const header_label = mappings.selected_header.parentElement;
			mappings.button__delete.disabled =
				header_label.tagName !== 'LABEL' ||
				dom_helper.is_header_unmapped(header_label);
		}

	},

};

module.exports = mappings;
