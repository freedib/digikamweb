
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
						i18n = row.translations;
						setSelectionOptions('language',row.languages,row.lang);
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
						vars = {};
						$('.menu').hide();
						setLoginoutIcon();	
						cleanApp ();
						$('#message').html('');
					}
				});
		}
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
		$('#select-single').prop('checked', false);
		$('#select-range').prop('checked', false);

		// make query to fill albums and tags
		getDataAndThen ('/albums/', {}, updateSelectionList, 'albums');
		getDataAndThen ('/tags/', {}, updateSelectionList, 'tags');

		// set language option
		$('#opt_lang_'+vars.lang).prop('checked', true);
		selectLanguage(vars.lang);

		$('.menu input[type=text').val('');

		$('#max_thumbnails').val(vars.max_thumbnails);
		
		$('.menu').show();
		enableField ($('#download'), false);
	}

	function cleanApp () {
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
		launch_search ();
	});

	// download new translations and update html fields / messages
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

	// called by change event on generated selections list
	function onChangeListItem (listkey, id, checked, list) {
	//	console.log (listkey+' '+id+' '+checked);
		list[id].selected = checked;		// albums or tags
		launch_search ();
	}

	// simulate radio-button on select-single and select-range
	$("#select-single").on("change", function() {
		$('#select-range').prop('checked', false);
	});
	$("#select-range").on("change", function() {
		$('#select-single').prop('checked', false);
	});


	// launch a search query to the server
	function launch_search () {
		let parameters = imagesParameters();
		if (parameters)
			getDataAndThen ('/search/', parameters, renderGallery);
	}
	
	
	/////// Navigation utilities ///////

	
	function extract_date (datetime_string) {
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
		let paras_a=[], paras_t=[], paras_d='', paras_m, row;
		vars.albumslist.forEach(row => {
			if (row.selected)
				paras_a.push(row.id);
		});
		vars.tagslist.forEach(row => {
			if (row.selected)
				paras_t.push(row.id);
		});
		let ds = extract_date (vars.datetimes.start);
		let de = extract_date (vars.datetimes.end);
		if (ds==null || de==null)
			return null;
		paras_d = [ds, de];
		paras_m = vars.max_thumbnails;
		return {albumsid:paras_a, tagsid:paras_t, datetimes:paras_d, max_thumbnails:paras_m};
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
	

	// reveive albums and tags data from server
	function updateSelectionList (data, datakey) {
		let listobj, checkfirst=false;

		if (datakey==='albums') {
			listobj = vars.albumslist;
		//	checkfirst = true;
		}
		else
			listobj = vars.tagslist;
		
		while(listobj.length > 0)		// empty listobj
		    listobj.pop();

		for (let irow=0; irow<data.rows.length; irow++) {
			var row = data.rows[irow];
			row.selected = (checkfirst && irow==0)? true: false;
			listobj.push(row);
		}
		
		selectItems (datakey, listobj);
	}
	

	function setSelectionOptions (fieldid, options, defaultvalue) {
		html = '<select id="'+fieldid+'">';
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

	// display albums or tags for selection
	function selectItems (listkey, list) {
		
	//	console.log (list);

		var html='';
		html +=	'<ul>';
		for (let irow=0; irow<list.length; irow++) {
			row = list[irow];
			if (listkey=='albums')
				html += '<li><input type="checkbox" '+
						'id="'+listkey+'_'+irow+'" name="'+listkey+'" '+
						'value="'+irow+'">'+row.relativePath+'</li>';
			else if (listkey=='tags' && row.pid==4) {
				html += '<li><input type="checkbox" '+
						'id="'+listkey+'_'+irow+'" name="'+listkey+'" '+
						'value="'+irow+'">'+row.name+'</li>';
			}
		}
		html +=	'</ul>';

		$('#'+listkey+'-list').html(html);

		// hide unused lang
		selectLanguage(vars.lang);
	
		// set on change function
		for (let index=0; index<list.length; index++) {
			if (list[index].selected) 
				$('#'+listkey+'_'+index).prop('checked', true);
			$('#'+listkey+'_'+index).on('change', function() {
				onChangeListItem ($(this).prop("name"), $(this).val(), $(this).is(':checked'), list);
			});
		}
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
				row = data.rows[irow];
				let row_thumbDate;
				if (row.creationDate.indexOf('T')>0)
					row_thumbDate = row.creationDate.split('T')[0];			// remove HH:MM:SS.CCC from datetime (SQLite3)
				else
					row_thumbDate = row.creationDate.split(' ')[0];			// remove HH:MM:SS from datetime (Mariadb)
				let imagekey = ''+row.thumbId+'_'+row.id+'_'+ row_thumbDate;
				getDataAndThen ('/thumbnails/'+row.thumbId, {}, renderThumnail, imagekey);

				// add thumbnail field to gallery 
				//  vars.last_thumbdate is the last date. add the new + as title 
				console.log (vars.last_thumbdate, row_thumbDate);
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
			}

			$('#gallery-container').show();
		}
	}

	// query a thumbnail and add the received blob or base64 thumbnail to the gallery
	function renderThumnail (data, imagekey) {
	
		vars.imagekeys.push(imagekey);									// keep imakekey reference

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
			if (getSelectionMode(event))
				updateImagesSelection ('image', imagekey);				// selection mode active. add/remove to selection list
			else {
				let albumid = imagekey.split('_')[1];					// imagekey: tn_thumbid_albumid_date
				getDataAndThen ('/images/'+albumid, {}, renderImage);	// get and display real image
			}
		});

		checkbox.on('change', [imagekey], function(event) {		// checkbox clicked. add/remove to selection list
			let imagekey = event.data[0];
			updateImagesSelection ('checkbox', event.data[0]);
		});
	}

	
	// selection logic. add/reemove keys to vars.selectedkeys
	// update checkboxes state
	function updateImagesSelection (source, imagekey) {

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

		console.log ('mode='+mode+', op='+op+', imagekey='+imagekey);
		
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
		enableField ($('#download'), vars.selectedkeys.length>0);	// enable/disble download
		vars.last_imagekey = imagekey;
		console.log (vars.last_imagekey, vars.selectedkeys);
	}

	// allow selection with mouse or header buttons
	function getSelectionMode (event) {
	//	console.log ('ctrlKey, altKey, shiftKey:', event.ctrlKey, event.altKey, event.shiftKey);
	//	console.log ('select some, range:', $('#select-single').is(':checked'), $('#select-range').is(':checked'));
		if (event.ctrlKey || $('#select-single').is(':checked'))
			return 'single';
		if (event.shiftKey || $('#select-range').is(':checked'))
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
