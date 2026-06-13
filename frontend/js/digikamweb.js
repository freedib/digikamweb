
// digiKam web - frontend

// Didier Bertrand © 2026

const version = "1.0.0";


$(function main() {

	// Globals variables

	var vars = {}
	
	// create or recreate (after a logout) vars
	function init_vars () {
		if (Object.keys(vars).length == 0) {
			vars.lang           = null;					// language of display		
			vars.state          = null;					// loggedIn or LoggedOut
			vars.role           = null;					// user or admin. not used
		}
		if (Object.keys(vars).length <= 3) {
			vars.albumslist     = [];					// selected albums
			vars.tagslist       = [];					// selected tags
			vars.datetimes      = {start:'', end:''};	// selected datetimes
			vars.max_thumbnails = 20;					// selected maximum thumbnails to display. normal: 100-2000
			vars.default_sort   = "desc";				// initial sorting order. "asc" or "desc"
			vars.force_tags_asc = true;					// if true, tags always "asc"
			
			vars.selectedkeys   = [];					// images id if thumbnail in gallery
			vars.imagekeys      = [];					// selected images
			vars.last_thumbdate = null;					// last thumbdate displayed in gallery
			vars.last_imagekey  = null;					// last thumbid clicked
		}		
	}
	
	init_vars ();
	
	/////// Languages ///////
	
	//  messages
	var i18n = null;

	// translate frontend message
	function m (messageid) {
		if (messageid == '')
			return messageid;
		let message;
		if (i18n && i18n.frontend && i18n.frontend[messageid])
			message = i18n.frontend[messageid];
		else if (i18n && i18n.backend && i18n.backend[messageid])
			message = i18n.backend[messageid];
		return message? message: messageid;
	}

	// set labels according to language
	function selectLanguage(language) {
		if (i18n == null)
			return;
		$('#lang-dateFrom').text(m('dateFrom'));
		$('#lang-dateTo').text(m('dateTo'));
		$('#lang-maximum').text(m('maximum'));
		$('#lang-albums').text(m('albums'));
		$('#lang-tags').text(m('tags'));
	}

	
	
	/////// Login/logout handling ///////

	$(document).ready(function() {
		$('.menu').hide();
		var testing = false;
		if (testing) {
			vars.state = 'loggedIn';
			vars.role = 'admin';
			vars.lang = 'fr';
			initializeApp ();
		}
	});

	// do login or logout when click on button or enter key
	function doLoginout (action) {
		$('#message').html('');
		if (vars.state!='loggedIn') {
			postDataAndThen("/login", { username:$('#username').val(), password:$('#password').val() },
				function(res, textStatus, jqXHR) {
					if (res.type=='table/login') {
						init_vars ();	// if vars were cleared after a logout
						let row = res.rows[0];
						vars.state = row.state;
						vars.role = row.role;
						vars.lang = row.lang;
						vars.max_thumbnails = row.max_thumbnails? row.max_thumbnails: '';
						vars.default_sort = row.default_sort!=null? row.default_sort.toLowerCase(): vars.default_sort;
						vars.force_tags_asc = row.force_tags_asc!=null? row.force_tags_asc: vars.force_tags_asc;
						i18n = row.translations;
						setSelectOptions ('language', row.languages, row.lang);		// set languages liste
						setLoginoutIcon();
						initializeApp ();
					}
					else if (res.type=='error') {
						$('#message').html(res.rows[0].message);
					}
					else
						$('#message').html(m('Forbidden'));
				});
		}
		else {
			postDataAndThen("/logout", { username: $('#username').val() },
				function(res, textStatus, jqXHR) {
					if (res.type=='table/logout') {
						$('.menu').hide();
						setLoginoutIcon();	
						cleanApp ();
						$('#message').html('');
						vars = {};
					}
				});
		}
	}

	// set option list of a <select> 
	function setSelectOptions (fieldid, options, defaultvalue) {
		let html = '<select id="'+fieldid+'">';
		var optionslength = options.length;
		for (var opt = 0; opt < optionslength; opt++) {
			if (options[opt]==defaultvalue)
				html += '<option selected>'+m(options[opt])+'</option>';
			else
				html += '<option>'+m(options[opt])+'</option>';
		}
		html += '</select>';
		
		$('#language').html(html);
	}



	// adjust login/logout button image
	function setLoginoutIcon() {
		if (vars.state=='loggedIn') {
			$('#loginout').addClass('lock-closed');
			$('#loginout').removeClass('lock-open');			
		}
		else {
			$('#loginout').addClass('lock-open');
			$('#loginout').removeClass('lock-closed');			
		}
	}

	// inialize menu
	function initializeApp () {
		
		init_vars ();	// if vars were cleared after a logout
		
		// reset buttons
		$('.menu input[type=checkbox]').prop('checked', false);		// checkboxes
		$('#sort').prop('checked', vars.default_sort.startsWith('a')? true: false);
		$('#select-single').prop('checked', false);
		$('#select-range').prop('checked', false);

		// make query to fill albums and tags
		let parameters = listsParameters();
		getDataAndThen ('/albums/', parameters, renderMenuList, 'albums');
		parameters = listsParameters(vars.force_tags_asc);
		getDataAndThen ('/tags/', parameters, renderMenuList, 'tags');

		// set language option
		$('#opt_lang_'+vars.lang).prop('checked', true);
		selectLanguage(vars.lang);

		$('.menu input[type=text').val('');

		$('#max_thumbnails').val(vars.max_thumbnails);
		
		$('.menu').show();
		enableField ($('#download'), false);
	}

	function cleanApp () {
		$('#sort').prop('checked', vars.default_sort.startsWith('a')? true: false);
		$('#select-single').prop('checked', false);
		$('#select-range').prop('checked', false);
		
		$('#gallery-container').unbind();
		$('#gallery-container').empty();
		$('#media-container').unbind();
		$('#media-container').empty();
		$('#albums-list').unbind();
		$('#albums-list').empty();
		$('#tags-list').unbind();
		$('#tags-list').empty();
	}
	
	function enableField (field, state) {
		if (!state)
			field.prop('disabled','disabled');
		else
			field.removeAttr('disabled','disabled');
	}


		
	/////// Events ///////

	$(document).keydown(function(event) {
		if (!vars.state || vars.state=='loggedOut') {
			if (event.which === 13)
				doLoginout ();
		}
		else {
			if (event.which === 27) {
				$('#media-container').unbind();
				$('#media-container').empty();
			}
		}
	}); 

	$('#loginout').on('click', function(event) {
		doLoginout ();
	});


	// capture datetimes or limit from menu text inputs
	$('.menu input[type=text').on('change', function() {
	//	console.log ($(this).prop('id'), $(this).val());
		if ($(this).prop('id') == 'datetime-start')
			vars.datetimes.start = $(this).val();
		else if ($(this).prop('id') == 'datetime-end')
			vars.datetimes.end = $(this).val();
		else if ($(this).prop('id') == 'max_thumbnails')
			vars.max_thumbnails = $(this).val();
		launchSearch ();
	});
	
	// change sort order. launch search
	$('#sort').on('change', function(event) {
		// update lists order (only albums)
		saveListChecked ('albums', vars.albumslist);
		
		if ($('#sort').is(':checked'))
			vars.albumslist.sort((a,b) => b>a?-1:1);		// ASC
		else
			vars.albumslist.sort((a,b) => b>a?1:-1);		// DESC
		
		createMenuList ('albums', vars.albumslist);
		restoreListChecked ('albums', vars.albumslist);
		launchSearch ();
	});

	// download new translations from server and update html fields / messages
	$( "#language").on( "change", function() {
		getDataAndThen ('/translations/'+$(this).val(), {},
			function (data, langkey) {
				i18n = data.rows[0].translations;
				vars.lang = langkey;
				selectLanguage(vars.lang);
				
			}, $(this).val());
	} );

	// let the server create a list of selected pictures and download it
	$('#download').on('click', function(event) {
		parameters = zipParameters();
		if (parameters)
			getDataAndThen ('/save/', parameters, downloadImages);
	});

	
	// simulate radio-button on select-single and select-range
	$("#select-single").on("change", function() {
		$('#select-range').prop('checked', false);
		if (!$('#select-single').is(':checked') && !$('#select-range').is(':checked'))
			updateImagesSelection ('clear');
	});
	$("#select-range").on("change", function() {
		$('#select-single').prop('checked', false);
	if (!$('#select-single').is(':checked') && !$('#select-range').is(':checked'))
		updateImagesSelection ('clear');
	});


	// launch a search query to the server
	function launchSearch () {
		let parameters = imagesParameters();
		if (parameters)
			getDataAndThen ('/search/', parameters, renderGallery);
	}
	
	
	/////// Navigation utilities ///////

	
	function extractDate (datetime_string) {
		let datetime = datetime_string, index;
		datetime = datetime.replaceAll ('-','');			// in date
		datetime = datetime.replaceAll (':','');			// in hour
		datetime = datetime.replace (' ','_');				// separe date from hour
		datetime = datetime.replaceAll (' ','');			// clean
		if ([0, 4, 6, 8, 11, 13, 15].indexOf(datetime.length) < 0 || 		// check total length
			[-1, 4, 6, 8].indexOf(datetime.indexOf('_')) < 0 ) {			// check date length
			$('#message').html(m('InvalidDate')+': '+datetime_string);
			return null;
		}
		return datetime;
	}
	
	// create parameters list for image request
	function imagesParameters () {
		let paras_a=[], paras_t=[];
		getListChecked('albums').forEach(index => {
			paras_a.push(vars.albumslist[index].id);
		});
		getListChecked('tags').forEach(index => {
			paras_t.push(vars.tagslist[index].id);
		});
		let ds = extractDate (vars.datetimes.start);
		let de = extractDate (vars.datetimes.end);
		if (ds==null || de==null)
			return null;
		let paras_d = [ds, de];
		let paras_m = vars.max_thumbnails;
		let paras_s = $('#sort').is(':checked')? 'ASC': 'DESC';
		return {albumsid:paras_a, tagsid:paras_t, datetimes:paras_d, max_thumbnails:paras_m, sort:paras_s};
	}
	
	// create parameters list for image request
	function listsParameters (force_asc) {
		let paras_s = $('#sort').is(':checked')? 'ASC': 'DESC';
		if (force_asc)
			paras_s = 'ASC';
		return {sort:paras_s};
	}

	// create parameters list for zip search
	function zipParameters () {
		let paras_i=[], row;
		vars.selectedkeys.forEach(row => {
			paras_i.push(row);
		});
		return {imagesid:paras_i};
	}

	function downloadImages (data) {
		 console.log (window.location.origin);
		 if (data.rows.length > 0) {
			url = window.location.origin + data.rows[0].path + '/' + data.rows[0].name;
			
			const link = document.createElement('a');
			link.href = url;
			link.download = data.rows[0].name;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			$('.thumbnail-checkbox').prop('checked', false);			// unselect all images
			vars.selectedkeys = [];								// empty checked list
		 }
	}

	

	/////// Post / Get json data ///////
	
	// post parameters using url
	// if nextstep is string, hide form is requested and adjust navigation hash to go back
	// if nextstep is function, execute callback
	function postDataAndThen (url, parameters, nextstep) {
		fetch (url, {
				method: 'POST',
				body: JSON.stringify(parameters),
				headers: {"Content-type": "application/json; charset=UTF-8"}
		})
	    .then(res => {
			if (res.status!=200) {
				if (res.rows && res.rows.length>0)
					$('#message').html(res.rows[0].message);
				else
					$('#message').html(m('HTMLError'));
			}
			return res.json();
		})
	    .then(data => {
			nextstep (data);
		})
	    .catch(error => {
			console.log(error);
		});
	}


	// add object parameters to an url
	function createURL (urlbase, parameters) {
		let url = urlbase;
		if (parameters) {
			let sep = "?";
			for (let p in parameters) {
				url += sep + p + "=" + parameters[p];
				sep = '&';
			}
		}
		return url;
	}

	// get data from server and pass data to nextstep
	function getDataAndThen (urlbase, parameters, nextstep, datakey) {
		const url = createURL(urlbase, parameters);
	//	console.log ('get '+url+', datakey=');

		let imagedims;
		
			$('#message').html('');
			fetch (url)
		    .then(res => {
				const contentType = res.headers.get('content-type');
				imagedims = {width:res.headers.get('X-image-width'), height:res.headers.get('X-image-height')};
				if (contentType && contentType.includes('application/json'))
					return res.json();
				if (contentType && contentType.includes('image/jpeg'))
					return res.blob();
				$('#message').html('Invalid content-type:'+contentType);
			})
		    .then(data => {
				if (!data) {
					$('#message').html(m('NoData'));
					return;
				}
				if (data.type == 'error') {
					$('#message').html(data.rows[0].message);
					return;
				}
				else if (nextstep)
					nextstep (data, datakey, imagedims);
			})
		    .catch(error => console.error('Error:', error));
	}
	
	
	/////// Next steps ///////

		
	// receive albums and tags data from server
	function renderMenuList (data, datakey) {
		let listobj = datakey==='albums'? vars.albumslist: vars.tagslist;
		while(listobj.length > 0)			// empty listobj
		    listobj.pop();
		for (let irow=0; irow<data.rows.length; irow++) {
			var row = data.rows[irow];		// copy received row
			row.selected = false;
			listobj.push(row);
		}
		createMenuList (datakey, listobj);	// create list in menu
	}
	

	// display albums or tags for selection
	function createMenuList (listkey, list) {
		let html='', tree;
	//	console.log (list);
		tree = characterizeTree (listkey, list);
	//	console.log(tree);
		html = '<ul>'+ buildHtmlTree (listkey,list,tree,'') +'</ul>';
	//	console.log (html);
			
		$('#'+listkey+'-list').html(html);
		
		let top_element = $('#'+listkey+'-'+tree[Object.keys(tree)[0]].index);
		updateMenuListVisibility (top_element);
		
		// set on click function
		for (let index=0; index<list.length; index++) {
			$('#'+listkey+'-'+index).on('click', function(event) {
			//	let listkey = $(this).prop("name");
			//	let index =  $(this).val();
				let checked =  $(this).is(':checked');
				if ($(this).next('ul').find('input').length > 0) {	// group button
					updateMenuListVisibility (this, event.shiftKey);
					if (!checked)
						launchSearch ();		// launch a search to reflect unchecked items
				}
				else							// album button
					launchSearch ();
			});
		}
	}
	
	// build a tree a all albums or tags paths
	function characterizeTree (listkey, list) {
		let tree={}, ptree;
		let ilist, ipart, item;
		for (ilist=0; ilist<list.length; ilist++) {
			if (listkey=='albums')
				item = list[ilist].relativePath;
			else if (listkey=='tags' && list[ilist].pid==4)
				item = list[ilist].name;
			else
				continue;
			let parts;
			if (listkey=='albums') {
				parts = item.split('/');
				if (parts.length==2 && parts[0]=='' && parts[1]=='') {
					parts = [''];						// "/" created 2 parts
				}
			}
			else {
				item = ':'+item;						// add a level to users to allow hide groups
				parts = item.split(':');
				for (let ip=0; ip<parts.length; ip++)
					parts[ip] = parts[ip].trim();
			}
			// create nodes for all items on path. sometime parents items may come later in list
			for (ipart=0, ptree=tree; ipart<parts.length; ipart++) {
				let node='node_'+parts[ipart];
				if (!ptree[node]) {						// create the node as node_{item_name}
					let index = ilist;					// index of item in vars.albumslist ot vars.tagslist
					if (ipart!=parts.length-1)
						index = -1;						// don't set index for parents in chain
					ptree[node] = {index:index,children:0};
				}
				else if (ipart==parts.length-1 && ptree[node].index<0)		// parents items created by children
					ptree[node].index = ilist;			// update index of a parent part in case it came after chlidren
				if (ipart<=parts.length-2) {			// if group
					++ptree[node].children;				// update count for the last parent
														// not a real children count. means at least one children
				}
				ptree = ptree[node]
			}
		}
		return tree;
	}

	// build the HTML tree
	function buildHtmlTree (listkey, list, tree, classes) {
		let html='';

		for (let key in tree) {
			if (key.startsWith('node_')) {
				let node = tree[key];

				if (node.index<0) {
					// a group name for persons (group: name) have been specified
					// create a fake tag entry to control children
					node.index = list.length;
					list[list.length] = {};						
				}
				
				let effectiveclasses;
				if (node.children>0)			// set checkbox style
					effectiveclasses = 'group '+classes;
				else
					effectiveclasses = 'child '+classes;
					
				let li = '<input type="checkbox" '+
						'id="'+listkey+'-'+node.index+'" name="'+listkey+'" '+
						'class="'+effectiveclasses+'" ' +
						'value="'+node.index+'">'+key.substr(5,);

				if (node.children==0)
					html += '<li class="'+effectiveclasses+'">'+li+'</li>';
				else {
					let group_class = listkey+'-'+node.index;	// define a class to hide children
					let symbol = listkey=='albums'? '/': ':';
					html += '<li class="'+effectiveclasses+'">'+li+symbol+'<ul>';
					html += buildHtmlTree (listkey, list, node, classes+' '+group_class);
					html += '</ul></li>';
				}
			}
		}
		return html;
	}
	
	// find items checked in album and tags lists
	function getListChecked (listkey) {
		var values=[];
		let htmlkey = listkey+'-list';
		let items = $('#'+htmlkey).find('.child:checkbox:checked').filter(function(){
			values.push($(this).val());
		});
		return values;
	}

	
	// save selected items in list to restore after a sort
	function saveListChecked (listkey, list) {
		let itemslist = getListChecked (listkey);
		for (let index=0; index<list.length; index++)
			list[index].selected = false;
		for (let item=0; item<itemslist.length; item++)
			list[itemslist[item]].selected = true;
	}

	// set check again items that were checked before a sort
	function restoreListChecked (listkey, list) {
		for (let index=0; index<list.length; index++) {
			if (list[index].selected) {
				let element = $('#'+listkey+'-'+index);
				let count=2;
				do {
					element.prop('checked', true);
					if (count-- > 0)				// open parent group but check all parents
						updateMenuListVisibility (element);
					element = $(element).parent().parent().prev('input');
				} while (element.length > 0);
			}
		}
	}

	// 	show or hide lists sections after a change
	function updateMenuListVisibility (element, shiftkey) {
		// hide or show class
		if ($(element).is(':checked')) {
			if (shiftkey) {														// open all submenus
				$('.'+$(element).prop('id')).show();							// children have parent id as class. show them
				$(element).next('ul').find('input').filter(function() {			// open all children groups
					return $(this).hasClass('group')
				}).prop('checked', true);
			}
			else {																// open just first level of children
			//	$(element).next('ul').show();
				$(element).next('ul').children('li').show();
				$(element).next('ul').children('li').children('input').show();
			}
		}
		else {
			$(element).next('ul').find('input').prop('checked', false);			// uncheck children checkbox
			$('.'+$(element).prop('id')).hide();								// children have parent id as class. hide them
		}
		$(element).parent().parent().prev('input').prop('checked', true);
	}


	/////// Render gallery ///////

	
	// query a search for images and for the received list of thumbnails call renderThumnail
	// handle event on images
	function renderGallery (data) {
		$('#media-container').unbind();
		$('#media-container').empty();
		$('#select-single').prop('checked', false);
		$('#select-range').prop('checked', false);

		vars.imagekeys = [];
		
		if (data.type == 'error') {
			$('#message').html(data.rows[0].message);
		}
		else {
		//	console.log ('render '+data.rows.length+' items');
			$('#gallery-container').unbind();
			$('#gallery-container').empty();

			vars.last_thumbdate = '0000-00-00';
			for (let irow=0; irow<data.rows.length; irow++) {
				let row = data.rows[irow];
				let row_thumbDate;
				if (row.creationDate.indexOf('T')>0)
					row_thumbDate = row.creationDate.split('T')[0];			// remove HH:MM:SS.CCC from datetime (SQLite3)
				else
					row_thumbDate = row.creationDate.split(' ')[0];			// remove HH:MM:SS from datetime (Mariadb)
				let imagekey = ''+row.thumbId+'_'+row.id+'_'+ row_thumbDate;
				getDataAndThen ('/thumbnails/'+row.thumbId, {}, renderThumnail, imagekey);

				// add thumbnail field to gallery 
				// vars.last_thumbdate is the last date. add the new + as title 
			//	console.log (vars.last_thumbdate, row_thumbDate);
				if (vars.last_thumbdate != row_thumbDate) {
					vars.last_thumbdate = row_thumbDate;
					$('#gallery-container').append('<div><h2>'+row_thumbDate+'</h2></div>');
				}

				// prepare an empty image which will be updated on thumbnail reception
				// this insure thumbnail will be ordered on display event if not received ordered
				let html = '';
				html += '<div class="thumbnail-container">'
				html +=     '<input type="checkbox" id="cb_'+imagekey+'" class="thumbnail-checkbox"/>'
				html +=         '<img id="tb_'+imagekey+'" src=""/>'
				html +=         '<label for "cb_'+imagekey+'">'
				html +=     '</label>'
				html +=     '<div id="tbn_'+imagekey+'" class="thumbnail-name"><small>'+row.name+'</small></div>'
				html += '</div>'
				$('#gallery-container').append(html);
				
				vars.imagekeys.push(imagekey);							// keep imakekey reference for image selection
			}

			$('#gallery-container').show();
		}
	}

	// query a thumbnail and add the received blob or base64 thumbnail to the gallery
	function renderThumnail (data, imagekey) {
	
		let imageUrl = getImageURL(data);
		$('#tb_'+imagekey).prop('src', imageUrl);						// update img src


		// set callbacks on checkbox
		let thumbnail = $('#tb_'+imagekey);
		let checkbox = $('#cb_'+imagekey);
		
		thumbnail.on('mouseover', [imagekey], function(event) {			// show checkbox if mouse over image
			let checkbox = $('#cb_'+event.data[0]);
			checkbox.fadeTo("fast", 1);
			let imagename = $('#tbn_'+event.data[0]);
			imagename.fadeTo("fast", 1);
		});
		
		thumbnail.on('mouseout', [imagekey], function(event) {			// hide checkbox if mouse leave image
			let checkbox = $('#cb_'+event.data[0]);
			if (!checkbox.is(":hover") && !checkbox.is(':checked'))
				checkbox.fadeTo("fast", 0);
			let imagename = $('#tbn_'+event.data[0]);
			imagename.fadeTo("fast", 0);
		});

		thumbnail.on('click', [imagekey], function(event) {				// hide checkbox if mouse leave image
			event.preventDefault();
			let imagekey = event.data[0];
			if (getSelectionMode(event)) {
				updateImagesSelection ('image', imagekey, event);		// selection mode active. add/remove to selection list
				vars.last_imagekey = imagekey;
			}
			else {
				let albumid = imagekey.split('_')[1];					// imagekey: tn_thumbid_albumid_date
				getDataAndThen ('/images/'+albumid, {}, renderImage);	// get and display real image
			}
		});

		checkbox.on('click', [imagekey], function(event) {		// checkbox clicked. add/remove to selection list
			let imagekey = event.data[0];
			updateImagesSelection ('checkbox', event.data[0], event);
			vars.last_imagekey = imagekey;
		});
	}

	
	// selection logic. add/remove image keys to vars.selectedkeys
	// update checkboxes state
	function updateImagesSelection (source, imagekey, event) {
		if (source=='clear') {		// both selection button unchecked
			$('.thumbnail-checkbox').prop('checked', false);	// unselect all images
			vars.selectedkeys = [];								// empty checked list
			enableField ($('#download'), false);				// disable download button
			return;
		}
		let mode = getSelectionMode(event);
		let thisCheckbox = $('#cb_'+imagekey);
		let thisSelIndex = vars.selectedkeys.indexOf(imagekey);

		let op = mode;
		if (source == 'checkbox')
			op = thisCheckbox.is(':checked')? 'single': 'remove';
		else if (op=='single' && thisCheckbox.is(':checked'))
			op = "remove";
		else if (op=='range' && vars.selectedkeys.length==0)
			op = "single";

	//	console.log ('mode='+mode+', op='+op+', imagekey='+imagekey);
		
		if (op=='remove' && thisSelIndex>=0) {						// remove one
			vars.selectedkeys.splice(thisSelIndex, 1);
			setCheckbox (source, thisCheckbox, false);
		}
		else if (op=='single' && thisSelIndex<0) {					// add one
			vars.selectedkeys.push(imagekey);
			setCheckbox (source, thisCheckbox, true);
		}
		else if (op=='range') {
			let thisImgIndex = vars.imagekeys.indexOf(imagekey);
			let lastImgIndex = vars.imagekeys.indexOf(vars.last_imagekey);
			if (thisImgIndex==lastImgIndex || thisImgIndex<0 || lastImgIndex<0)
				return;									// should not happen
			let indexStart = lastImgIndex<thisImgIndex? lastImgIndex: thisImgIndex;
			let indexEnd   = lastImgIndex<thisImgIndex? thisImgIndex: lastImgIndex;
			for (index=indexStart; index<=indexEnd; index++) {
				let key = vars.imagekeys[index];
				if (vars.selectedkeys.indexOf(key) < 0) {
					vars.selectedkeys.push(key);					// update list
					checkbox = $('#cb_'+key);						// update checkbox
					setCheckbox (source, checkbox, true)
				}
			}
		}

		vars.selectedkeys.sort();
		enableField ($('#download'), vars.selectedkeys.length>0);	// enable/disable download
	}

	// allow selection with mouse or header buttons
	function getSelectionMode (event) {
	//	console.log ('ctrlKey, altKey, shiftKey:', event.ctrlKey, event.altKey, event.shiftKey);
	//	console.log ('select some, range:', $('#select-single').is(':checked'), $('#select-range').is(':checked'));
		if ((event && event.ctrlKey) || $('#select-single').is(':checked'))
			return 'single';
		if ((event && event.shiftKey) || $('#select-range').is(':checked'))
			return 'range';
		return null
	}

	// update checkbox check state
	function setCheckbox (source, checkbox, checked) {
		// update only if source is image
		if (source == 'image') {
			checkbox.prop('checked', checked);
			checkbox.fadeTo("fast", checked? 1: 0);
		}
	}

	

	/////// Render single image ///////

	// display and inageURL
	function renderImage (data) {
		imageUrl = getImageURL(data);

		let htmlmedia; 
		if (  imageUrl.indexOf('.mp4')>0 || imageUrl.indexOf('.mov')>0 ||
		      imageUrl.indexOf('.mpg')>0 || imageUrl.indexOf('.ogg')>0)
			htmlmedia = 'video id="video-field" controls auto';
		else
			htmlmedia = 'img id="image-field"';
		let html = '<'+htmlmedia+' src="'+imageUrl+'" class="media-field"/>';
		$('#media-container').html(html);
		$('#media-container').on('click', function(event) {
			$('#media-container').unbind();
			$('#media-container').empty();
		});
	}

	// create an URL from image data
	// image data may be an url, a blob or base64 json
	function getImageURL (res) {
		let image, imageBlob;

		if (res instanceof Blob) {						// image is a blob
			imageBlob = res;
			return URL.createObjectURL(imageBlob);
		}
		else if (res.type=='image/base64') {			// image is encoded base64
			var imageBase64 = res.rows[0].data;
			// base64 to ArrayBuffer
			const imageBinary = atob(imageBase64);
			const imageBytes = new Uint8Array(imageBinary.length);
			for (let i = 0; i < imageBinary.length; i++) {
			    imageBytes[i] = imageBinary.charCodeAt(i);
			}
			// ArrayBuffer to Blob
			imageBlob = new Blob([imageBytes.buffer], { type: 'image/jpeg' });
			return URL.createObjectURL(imageBlob);
		}
		else if (res.type='image/url') {				// image is an url
			return res.rows[0].url;
		}
		else
			$('#message').html(m('UnknownData'));
	}

});
