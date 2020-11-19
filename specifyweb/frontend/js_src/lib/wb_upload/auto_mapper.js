"use strict";

let auto_mapper_definitions = require('./json/auto_mapper_definitions.js');
let data_model = require('./data_model.js');
let cache = require('./cache.js');

/*
*
* Auto mapper than takes data model and header names and returns possible mappings
*
* */
const auto_mapper = {

	regex_1: /[^a-z\s]+/g,
	regex_2: /\s+/g,
	depth: 8,
	comparisons: Object.entries({
		regex: (header, regex) => header.match(regex),
		string: (header, string) => header === string,
		contains: (header, string) => header.indexOf(string) !== -1
	}),
	mapped_definitions_were_converted: false,

	// convert all table names and field names in mapping definitions to lower case
	convert_automapper_definitions(){

		auto_mapper.mapped_definitions_were_converted = true;

		const keys_to_lower_case = (object, levels = 1) => Object.fromEntries(
			Object.entries(object).map(([key, value]) =>
				[key.toLowerCase(), levels > 1 ? keys_to_lower_case(value, levels - 1) : value]
			)
		);

		auto_mapper_definitions['table_synonyms'] = keys_to_lower_case(auto_mapper_definitions['table_synonyms'], 1);
		auto_mapper_definitions['shortcuts'] = keys_to_lower_case(auto_mapper_definitions['shortcuts'], 1);
		auto_mapper_definitions['synonyms'] = keys_to_lower_case(auto_mapper_definitions['synonyms'], 2);

	},

	/*
	* Method that would be used by external classes to match headers to possible mappings
	* @param {array} raw_headers - Array of strings that represent headers
	* @param {string} base_table - Official name of the base table from data model
	* @return {array} Returns mappings result in format [header_name, mapping_path]
	* mapping path may look like:
	* 	[Accession, Accession Number]
	* 	OR
	* 	[Accession, Accession Agents, #1, Agent, Agent Type]
	* */
	map(payload){

		const use_cache = false;

		const {
			headers: raw_headers,
			base_table,
			path = [],
			path_offset = 0,
			allow_multiple_mappings = false,
			//use_cache = true,  //TODO: enable automapper cache
			commit_to_cache = true,
			check_for_existing_mappings = false,
			scope = 'automapper',
		} = payload;


		const cache_name = JSON.stringify(payload);

		if (use_cache && commit_to_cache) {
			const cached_data = cache.get('automapper', cache_name);
			if (cached_data)
				return cached_data;
		}

		if (!auto_mapper.mapped_definitions_were_converted)
			auto_mapper.convert_automapper_definitions();

		if (raw_headers.length === 0)
			return {};

		// strip extra characters to increase mapping success
		this.unmapped_headers = Object.fromEntries(raw_headers.map(original_name => {

			let stripped_name = original_name.toLowerCase();
			stripped_name = stripped_name.replace(this.regex_1, '');
			stripped_name = stripped_name.replace(this.regex_2, ' ');
			stripped_name = stripped_name.trim();
			const final_name = stripped_name.split(' ').join('');

			return [original_name, [stripped_name, final_name]];

		}));

		this.results = {};
		this.allow_multiple_mappings = allow_multiple_mappings;
		this.check_for_existing_mappings = check_for_existing_mappings;
		this.path_offset = path.length - path_offset;
		this.base_table_name = base_table;

		//  do 2 passes over the schema
		this.find_mappings_driver('shortcuts_and_table_synonyms', path, scope);
		this.find_mappings_driver('synonyms_and_matches', path, scope);


		if (!this.allow_multiple_mappings)
			for (const [header_name, mapping_paths] of Object.entries(this.results))
				this.results[header_name] = mapping_paths[0];

		const result = Object.entries(this.results);

		if (commit_to_cache)
			cache.set('automapper', cache_name, result);

		return result;

	},

	//makes sure that `find_mappings` runs over the schema in correct order
	find_mappings_driver(mode, path, scope){

		/*
			this.find_mappings_queue: {
				<mapping_path_length>: [  // used to enforce higher priority for closer mappings
					{
						table_name: <table_name>,
						path: [<mapping_path>],
						parent_table_name: '<parent_table_name>',
					}
				]
			}
		*/

		this.find_mappings_queue = {
			0: [
				{
					table_name: this.base_table_name,
					path: path,
					parent_table_name: '',
				}
			]
		};
		this.searched_tables = [];

		let queue_data;
		do {

			queue_data = Object.values(this.find_mappings_queue);
			this.find_mappings_queue = {};

			for (const mappings_data of queue_data)  // go though each level of the queue in order
				for (const payload of mappings_data)
					auto_mapper.find_mappings(payload, scope, mode);

		} while (queue_data.length !== 0);

	},

	find_mappings_in_definitions(payload){

		const {
			path,
			table_name,
			field_name,
			scope,
			mode,
			is_tree_rank = false
		} = payload;

		let definitions_source;
		if (mode === 'shortcuts_and_table_synonyms')
			definitions_source = 'shortcuts';
		else if (mode === 'synonyms_and_matches')
			definitions_source = 'synonyms';

		if (typeof auto_mapper_definitions[definitions_source][table_name] === "undefined")
			return;

		const handle_comparison = (comparisons, get_new_path_part) => {

			// compile regex strings
			if (typeof comparisons['regex'] !== "undefined")
				for (const [regex_index, regex_string] of Object.entries(comparisons['regex']))
					if (typeof regex_string === "string")
						comparisons['regex'][regex_index] = new RegExp(regex_string);

			for (const [header_key, header] of Object.entries(this.unmapped_headers)) {// loop over headers

				if (header === false)
					continue;

				const lowercase_header_key = header_key.toLowerCase();

				let matched = false;

				auto_mapper.comparisons.some(([comparison_key, comparison_function]) => {  // loop over defined comparisons

					if (typeof comparisons[comparison_key] !== "undefined")
						Object.values(comparisons[comparison_key]).some(comparison_value => {  // loop over each value of a comparison
							if (comparison_function(lowercase_header_key, comparison_value))
								return matched = auto_mapper.make_mapping(path, get_new_path_part(), header_key);
						});

					return matched;

				});

			}

		};

		if (mode === 'shortcuts_and_table_synonyms')
			for (const shortcut_data of auto_mapper_definitions[definitions_source][table_name]) {

				if (shortcut_data['scope'] !== scope)
					continue;

				const comparisons = shortcut_data['headers'];
				const get_new_path_part = () =>
					shortcut_data['mapping_path'];
				handle_comparison(comparisons, get_new_path_part);

			}


		else if (mode === 'synonyms_and_matches') {

			if (
				typeof auto_mapper_definitions[definitions_source][table_name][field_name] === "undefined" ||
				auto_mapper_definitions[definitions_source][table_name][field_name]['scope'] !== scope
			)
				return;

			const comparisons = auto_mapper_definitions[definitions_source][table_name][field_name]['headers'];
			const get_new_path_part = () => {
				if (is_tree_rank)
					return [data_model.tree_symbol + field_name[0].toUpperCase() + field_name.substr(1), 'name'];
				else
					return [field_name];

			};
			handle_comparison(comparisons, get_new_path_part);
		}

	},

	find_table_synonyms(table_name, path, mode, scope){

		const table_synonyms = [];
		if (
			mode === 'shortcuts_and_table_synonyms' &&
			typeof auto_mapper_definitions['table_synonyms'][table_name] !== "undefined"
		) {

			//filter out -to-many references from the path for matching
			const filtered_path = path.reduce((filtered_path, path_part) => {

				if (!data_model.value_is_reference_item(path_part))
					filtered_path.push(path_part);

				return filtered_path;

			}, []);

			const filtered_path_string = filtered_path.join('_');
			const filtered_path_with_base_table = [auto_mapper.base_table_name, ...filtered_path];
			const filtered_path_with_base_table_string = filtered_path_with_base_table.join('_');

			for (const table_synonym of auto_mapper_definitions['table_synonyms'][table_name]) {

				if (table_synonym['scope'] !== scope)
					continue;

				const mapping_path_string = table_synonym['preceding_mapping_path'].join('_');

				if (
					filtered_path_string.endsWith(mapping_path_string) ||
					filtered_path_with_base_table_string === mapping_path_string
				)
					table_synonyms.push(table_synonym['synonym']);

			}
		}

		return table_synonyms;

	},

	/*
	* Used internally to loop though each field of a particular table and try to match them to unmapped headers
	* This method iterates over the same table only once
	* @param {string} table_name - Official name of the base table from data model
	* @param {array} path - Mapping path from base table to this table. Should be an empty array if this is base table
	* */
	find_mappings(payload, scope, mode){

		const {
			table_name,
			path = [],
			parent_table_name = '',
			parent_relationship_type,
		} = payload;

		if (
			(  // don't iterate over the same table again when in `synonyms_and_matches` mode
				mode === 'synonyms_and_matches' &&
				this.searched_tables.indexOf(table_name) !== -1
			) ||
			path.length > auto_mapper.depth  // don't go beyond the depth limit
		)
			return;

		this.searched_tables.push(table_name);

		const table_data = data_model.tables[table_name];
		const ranks_data = data_model.ranks[table_name];
		const fields = Object.entries(table_data['fields']).filter(([, field_data]) =>
			!field_data['is_hidden'] &&
			!field_data['is_relationship']
		);
		const table_friendly_name = table_data['table_friendly_name'].toLowerCase();
		const table_synonyms = auto_mapper.find_table_synonyms(table_name, path, mode, scope);
		let table_names;
		if (table_synonyms.length === 0)
			table_names = [table_name, table_friendly_name];
		else
			table_names = table_synonyms;

		if (typeof ranks_data !== "undefined") {

			let ranks = Object.keys(ranks_data);
			const push_rank_to_path = path.length <= 0 || !data_model.value_is_tree_rank(path[path.length - 1]);

			if (!push_rank_to_path)
				ranks = [data_model.get_name_from_tree_rank_name(path[path.length - 1])];

			for (const rank_name of ranks) {

				const striped_rank_name = rank_name.toLowerCase();
				const final_rank_name = data_model.tree_symbol + rank_name;

				auto_mapper.find_mappings_in_definitions({
					path: path,
					table_name: table_name,
					field_name: striped_rank_name,
					scope: scope,
					mode: mode,
					is_tree_rank: true
				});

				if (mode !== 'synonyms_and_matches')
					continue;

				for (const [field_name, field_data] of fields) {

					const friendly_name = field_data['friendly_name'].toLowerCase();

					Object.entries(this.unmapped_headers).some(([header_name, header_data]) => {

						if (header_data === false)//skip mapped headers
							return false;

						let [stripped_name, final_name] = header_data;

						if (
							(  // find cases like `Phylum` and remap them to `Phylum > Name`
								friendly_name === 'name' &&
								striped_rank_name === stripped_name
							) ||
							(  // find cases like `Kingdom Author`
								striped_rank_name + ' ' + friendly_name === stripped_name ||
								striped_rank_name + ' ' + field_name === final_name
							)
						) {

							let new_path_parts;
							if (push_rank_to_path)
								new_path_parts = [final_rank_name, field_name];
							else
								new_path_parts = [field_name];

							auto_mapper.make_mapping(path, new_path_parts, header_name);

							// don't search for further mappings for this field if we can only map a single header to this field
							return !this.allow_multiple_mappings;
						}

					});

				}

			}
			return;
		}

		for (const [field_name, field_data] of fields) {

			// search in definitions
			auto_mapper.find_mappings_in_definitions({
				path: path,
				table_name: table_name,
				field_name: field_name,
				scope: scope,
				mode: mode,
			});

			if (mode !== 'synonyms_and_matches' && table_synonyms.length === 0)
				continue;


			// compare each field's schema name and friendly schema name to headers
			const friendly_name = field_data['friendly_name'].toLowerCase();

			for (const [header_name, header_data] of Object.entries(this.unmapped_headers)) {

				const lowercase_header_name = header_name.toLowerCase();

				if (header_data === false)  // skip mapped headers
					continue;

				let [stripped_name, final_name] = header_data;

				let matches =
					field_name === lowercase_header_name ||
					field_name === stripped_name ||
					field_name === final_name ||
					friendly_name === final_name;

				// find cases like `Collection Object Remarks`
				let to_many_reference_number = false;

				if (
					!matches &&
					table_synonyms.some(table_synonym =>
						stripped_name.startsWith(table_synonym) ||
						final_name.startsWith(table_synonym)
					)
				) {
					outer_loop:
						for (const table_synonym of table_names) {

							const regular_expressions = [
								new RegExp(table_synonym + ' (\\d+) ' + friendly_name),
								new RegExp(table_synonym + ' ' + friendly_name + ' (\\d+)')
							];

							for (const regular_expression of regular_expressions) {

								const match = lowercase_header_name.match(regular_expression);

								if (match === null || match[1] === "undefined")
									continue;

								to_many_reference_number = parseInt(match[1]);

								matches = true;
								break outer_loop;

							}

							if (
								table_synonym + ' ' + friendly_name === stripped_name ||
								table_synonym + ' ' + field_name === final_name
							) {
								matches = true;
								break;
							}

						}

				}

				if (matches)
					auto_mapper.make_mapping(path, [field_name], header_name, to_many_reference_number);

			}

		}


		const relationships = Object.entries(table_data['fields']).filter(([, {is_hidden, is_relationship}]) =>
			!is_hidden && is_relationship
		);


		for (const [relationship_key, relationship_data] of relationships) {

			const local_path = [...path, relationship_key];

			if (data_model.relationship_is_to_many(relationship_data['type']))
				local_path.push(data_model.format_reference_item(1));

			const new_depth_level = local_path.length;

			if (new_depth_level > auto_mapper.depth)
				continue;

			if (typeof this.find_mappings_queue[new_depth_level] === "undefined")
				this.find_mappings_queue[new_depth_level] = [];

			const {foreign_name} = relationship_data;

			let current_mapping_path_part = path[path.length - 1];
			if (data_model.value_is_reference_item(current_mapping_path_part) || data_model.value_is_tree_rank(current_mapping_path_part))
				current_mapping_path_part = path[path.length - 2];

			if (
				(  // don't iterate over the same tables again
					mode === 'synonyms_and_matches' &&
					(
						this.searched_tables.indexOf(relationship_data['table_name']) !== -1 ||
						this.find_mappings_queue[new_depth_level].map(({table_name})=>
							table_name
						).some(table_name=>
							table_name===relationship_data['table_name']
						)
					)
				) ||
				(  // skip circular relationships
					mode !== 'synonyms_and_matches' &&
					(  // skip circular relationships
						relationship_data['table_name'] === parent_table_name &&
						(
							(
								typeof foreign_name !== "undefined" &&
								typeof data_model.tables[parent_table_name]['fields'][foreign_name] !== "undefined" &&
								data_model.tables[parent_table_name]['fields'][foreign_name]['foreign_name'] === relationship_key
							) ||
							(
								data_model.tables[table_name]['fields'][relationship_key]['foreign_name'] === current_mapping_path_part
							)
						)
					)
				) ||
				(  // skip -to-many inside of -to-many  //TODO: remove this once upload plan is ready
					typeof relationship_data['type'] !== "undefined" &&
					typeof parent_relationship_type !== "undefined" &&
					relationship_data['type'].indexOf('-to-many') !== -1 &&
					parent_relationship_type.indexOf('-to-many') !== -1
				)
			)
				continue;

			this.find_mappings_queue[new_depth_level].push({
				table_name: relationship_data['table_name'],
				path: local_path,
				parent_table_name: table_name,
				parent_relationship_type: relationship_data['type'],
			});

		}

	},

	/*
	* Used to check if the table's field is already mapped and if not, makes a new mapping
	* Also, handles -to-many relationships by creating new objects
	* @param {array} path - Mapping path from base table to this table. Should be an empty array if this is base table
	* @param {array} new_path_parts - Elements that should be pushed into `path`
	* @param {string} header_name - The name of the header that should be mapped
	* @return {bool} Whether mapping was made. Mapping fails if field is inside of a -to-one relationship or direct child of base table and is already mapped
	* */
	make_mapping(path, new_path_parts, header_name, to_many_reference_number = false){

		let local_path = [...path, ...new_path_parts];

		//if precise -to-many index was found, insert it into the path
		if (to_many_reference_number !== false)
			local_path = local_path.reverse().reduce((modified_local_path, local_path_part) => {

				if (data_model.value_is_reference_item(local_path_part) && to_many_reference_number !== false) {
					local_path_part = data_model.format_reference_item(to_many_reference_number);
					to_many_reference_number = false;
				}

				modified_local_path.push(local_path_part);

				return modified_local_path;

			}, []).reverse();

		// check if this path is already mapped
		while (true) {

			// go over mapped headers to see if this path was already mapped
			let path_already_mapped =
				(
					!this.allow_multiple_mappings &&
					Object.values(this.results).some(mapping_paths =>
						mapping_paths.some(mapping_path =>
							JSON.stringify(local_path) === JSON.stringify(mapping_path)
						)
					)
				) ||
				(
					this.check_for_existing_mappings &&
					auto_mapper.get_mapped_fields(local_path) !== false
				);

			if (!path_already_mapped)
				break;

			let index = local_path.length;
			let path_was_modified = Object.entries(local_path).reverse().some(([local_path_index, local_path_part]) => {

				path_was_modified = index > auto_mapper.path_offset && data_model.value_is_reference_item(local_path_part);
				if (path_was_modified)
					local_path[local_path_index] = data_model.format_reference_item(data_model.get_index_from_reference_item_name(local_path_part) + 1);

				index--;

				return path_was_modified;

			});

			if (!path_was_modified)
				return false;
		}

		// prevent -to-many inside of -to-many // TODO: remove this in the future
		let distance_from_parent_to_many = -1;
		let has_nested_to_many = local_path.some(element => {
			const is_to_many = data_model.value_is_reference_item(element);

			if (distance_from_parent_to_many === 1 && is_to_many)
				return true;

			if (is_to_many)
				distance_from_parent_to_many = 0;
			else if (distance_from_parent_to_many !== -1)
				distance_from_parent_to_many++;

			return false;

		});

		if (has_nested_to_many)
			return false;


		// remove header from unmapped headers
		if (!this.allow_multiple_mappings)
			this.unmapped_headers[header_name] = false;

		if (typeof this.results[header_name] === "undefined")
			this.results[header_name] = [];

		this.results[header_name].push(local_path);

		return !this.allow_multiple_mappings;  // return whether the field got mapped or was mapped previously

	},
};

module.exports = auto_mapper;