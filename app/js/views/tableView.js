/* global $, window */
import {View, history} from 'backbone';
import _ from 'underscore';

import 'bootstrap';
import jsyaml from 'js-yaml';

import DialogView from './dialogView';
import ErrorView from './errorView';

import dataPopupTemplate from './../../templates/dataPopup.html';
import tableTemplate from './../../templates/table.html';

export default class TableView extends View {
  get tagName() {
    return 'div';
  }
  get className() {
    return 'tableview';
  }
  get events() {
    return {
      'click .gohan_create': 'createModel',
      'click .gohan_delete': 'deleteModel',
      'click .gohan_update': 'updateModel',
      'click a.title': 'filter',
      'keyup input.search': 'searchByKey',
      'change select.search': 'searchByField',
      'click nav li:not(.disabled) a': 'pagination'
    };
  }
  constructor(options) {
    super(options);

    this.errorView = new ErrorView();
    this.app = options.app;
    this.schema = options.schema;
    this.fragment = options.fragment;
    this.childview = options.childview;
    this.polling = options.polling;
    this.activePage = 1;
    this.pageLimit = options.collection.pageLimit || 10;
    this.activeFilter = {
      by: '',
      reverse: false
    };
    this.searchQuery = {
      sortKey: '',
      propField: ''
    };
    this.searchDelay = 500;
    this.searchTimeout = undefined;

    if (this.childview) {
      this.parentProperty = this.schema.get('parent') + '_id';
    }

    if (this.collection !== undefined) {
      this.collection.getPage().then(() => {
        if ( this.polling ) {
          this.collection.startLongPolling();
        }
      }, (...params) => {
        this.errorView.render(params[0]);
      });
    }


    this.listenTo(this.collection, 'update', this.render);
  }
  searchByKey(event) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchQuery.sortKey = event.currentTarget.value;

      $('input.search', this.$el).focus().val('').val(this.searchQuery.sortKey);
      $('select.search', this.$el).val('').val(this.searchQuery.propField);
    }, this.searchDelay);
  }
  searchByField(event) {
    this.searchQuery.propField = event.currentTarget.value;

    $('input.search', this.$el).val('').val(this.searchQuery.sortKey);
    $('select.search', this.$el).focus().val('').val(this.searchQuery.propField);
  }
  getPage(pageNo) {
    this.collection.getPage(pageNo - 1).then(() => {

      if ( this.polling ) {
        this.collection.startLongPolling();
      }

    }, (...params) => {
      this.errorView.render(params[0]);
    });
  }
  filterByQuery() {
    const property = this.searchQuery.propField;
    const value = this.searchQuery.sortKey;

    this.collection.filter(property, value).then(() => {

    }, (...params) => {
      this.errorView.render(params[0]);
    });
  }
  pagination(event) {
    let newActivePage = event.currentTarget.dataset.id;

    if (newActivePage === 'next') {
      newActivePage = Number(this.activePage) + 1;
    } else if (newActivePage === 'prev') {
      newActivePage = Number(this.activePage) - 1;
    }

    if (this.activePage === Number(newActivePage)) {
      return;
    }

    this.activePage = Number(newActivePage);

    this.getPage(Number(newActivePage));

    history.navigate(history.getFragment().replace(/(\/page\/\w+)/, '') + '/page/' + newActivePage);
  }
  dialogForm(action, formTitle, data, onsubmit) {
    this.schema.filterByAction(action, this.parentProperty).then(schema => {
      this.dialog = new DialogView({
        formTitle,
        data,
        onsubmit,
        schema: this.schema.toFormJSON(schema),
        unformattedSchema: this.schema,
        fields: schema.propertiesOrder
      });
      this.dialog.render();
    });
  }
  toLocal(data) {
    return this.schema.toLocal(data);
  }
  toServer(data) {
    return this.schema.toServer(data);
  }
  createModel() {
    const data = this.toLocal({});
    const formTitle = '<h4>Create ' + this.schema.get('title') + '</h4>';
    const action = 'create';
    const onsubmit = values => {
      values = this.toServer(values);
      values.isNew = true;
      this.collection.create(values).then(() => {
        this.dialog.close();
        this.render();
      }, error => {
        this.errorView.render(...error);
        this.dialog.stopSpin();
      });
    };

    this.dialogForm(action, formTitle, data, onsubmit);
  }
  updateModel(event) {
    const $target = $(event.target);
    const id = $target.data('id');
    const model = this.collection.get(String(id));
    const data = this.toLocal(model.toJSON());
    const action = 'update';
    const formTitle = '<h4>Update ' + this.schema.get('title') + '</h4>';
    const onsubmit = values => {
      values = this.toServer(values);

      model.save(values).then(() => {
        this.collection.trigger('update');
        this.dialog.close();
      }, error => {
        this.errorView.render(...error);
        this.dialog.stopSpin();
      });
    };

    this.dialogForm(action, formTitle, data, onsubmit);
  }
  deleteModel(event) {
    if (!window.confirm('Are you sure to delete?')) { // eslint-disable-line no-alert
      return;
    }
    const $target = $(event.target);
    const id = $target.data('id');
    const model = this.collection.get(String(id));

    model.destroy().then(() => {
      this.collection.fetch().catch(error => this.errorView.render(...error));
    }, error => this.errorView.render(...error));
  }
  renderProperty(data, key) {
    let content;
    const property = this.schema.get('schema').properties[key];
    const value = data[key];

    if (property === undefined) {
      return '';
    }

    if (value === undefined) {
      return '';
    }

    const relatedObject = data[property.relation_property]; // jscs:ignore requireCamelCaseOrUpperCaseIdentifiers

    if (relatedObject !== undefined) {
      if (relatedObject.name !== undefined) {
        return relatedObject.name;
      }
    }
    try {
      if (property.type === 'object' || property.originalType === 'object') {
        content = $('<pre style="width:500px;"></pre>').text(
          '<pre>' + jsyaml.safeDump(value) + '</pre>').html();
        content = content.replace('\'', '&#34;');
        return dataPopupTemplate({
          content
        });
      }
    } catch (error) {
      console.error(error);
    }

    try {
      if (property.type === 'array') {
        return '<pre>' + jsyaml.safeDump(value) + '</pre>';
      }
    } catch (error) {
      console.error(error);
    }

    return value;
  }

  /**
   * Filters array and return new array.
   * @param {Array} array
   * @param {string} searchQuery
   * @returns {Array}
   */
  filterArray(array, searchQuery) {
    if (this.searchQuery.sortKey === '') {
      return array;
    }
    return array.filter(value => {

      if (searchQuery.propField !== '') {
        const field = searchQuery.propField.toLowerCase();

        if (value.hasOwnProperty(field) && value[field].toString().includes(searchQuery.sortKey)) {
          return true;
        }
      } else {
        for (let key in value) {
          let val = value[key];

          if (val && val.toString().includes(searchQuery.sortKey.toString())) {
            return true;
          }
        }
      }

      return false;
    });
  }

  /**
   * Sorts array by specified property and return new array.
   * @param {Array} array
   * @param {string} by
   * @param {boolean} reverse
   * @returns {Array}
   */
  sortArray(array, by, reverse) {
    const sortedArray = _.sortBy(array, value => {
      if (by === '') {
        return value;
      }

      if (_.isString(value[by])) {
        return value[by].toLowerCase();
      }
      return value[by];
    });

    if (reverse === true) {
      return sortedArray.reverse();
    }
    return sortedArray;
  }
  render() {
    let list = this.collection.map(model => {
      const data = model.toJSON();
      const result = Object.assign({}, data);

      for (let key in data) {
        result[key] = this.renderProperty(data, key);
      }
      return result;
    });

    list = this.filterArray(list, this.searchQuery);

    list = this.sortArray(list, this.activeFilter.by, this.activeFilter.reverse);

    const splitIntoPages = [];

    for (let i = 0; i < list.length; i += this.pageLimit) {
      splitIntoPages.push(list.slice(i, i + this.pageLimit));
    }
    list = splitIntoPages;

    if (this.app && !this.childview) {
      this.app.breadCrumb.update([this.collection]);
    }

    this.$el.html(tableTemplate({
      data: list,
      activePage: this.activePage,
      pageCount: this.collection.getPageCount(),
      schema: this.schema.toJSON(),
      searchQuery: this.searchQuery,
      sort: {
        by: this.activeFilter.by,
        reverse: this.activeFilter.reverse
      },
      parentProperty: this.parentProperty
    }));
    this.$('button[data-toggle=hover]').popover();
    return this;
  }
  close() {
    if ( this.polling ) {
      this.collection.stopLongPolling();
    }
    this.remove();
  }
}
