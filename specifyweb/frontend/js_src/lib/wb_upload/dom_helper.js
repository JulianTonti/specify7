"use strict";

/*
*
* Various helper methods for finding DOM elements and interacting with them
*
* */

const cache = require('./cache.js');

const dom_helper = {


	// FIELDS

	get_lines(container, return_line_elements=false){

		const lines = Object.values(container.children);

		if(return_line_elements)
			return lines.map(line=>dom_helper.get_line_elements_container(line));
		else
			return lines;

	},

	get_line_elements_container(element){
		if(element.tagName==='DIV')
			return element.getElementsByClassName('wbplanview_mappings_line_elements')[0];
		else
			return element.parentElement;

	},

	get_line_elements(line_elements_container){
		return Object.values(line_elements_container.children);
	},

	get_line_header(line){

		const wbplanview_mappings_line_header = line.getElementsByClassName('wbplanview_mappings_line_header')[0];

		return wbplanview_mappings_line_header.innerText;

	},


	// MISC

	has_next_sibling: element =>
		element.nextElementSibling !== null,

	remove_elements_to_the_right(element){

		let changes_made = dom_helper.has_next_sibling(element);

		while (dom_helper.has_next_sibling(element))
			element.nextElementSibling.remove();

		return changes_made;

	}

};

module.exports = dom_helper;