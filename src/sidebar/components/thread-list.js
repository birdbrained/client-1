'use strict';

var events = require('../events');
var metadata = require('../annotation-metadata');

/**
 * Component which displays a virtualized list of annotation threads.
 */

var scopeTimeout = require('../util/scope-timeout');

/**
 * Returns the height of the thread for an annotation if it exists in the view
 * or `null` otherwise.
 */
function getThreadHeight(id) {
  var threadElement = document.getElementById(id);
  if (!threadElement) {
    return null;
  }

  // Note: `getComputedStyle` may return `null` in Firefox if the iframe is
  // hidden. See https://bugzilla.mozilla.org/show_bug.cgi?id=548397
  var style = window.getComputedStyle(threadElement);
  if (!style) {
    return null;
  }

  // Get the height of the element inside the border-box, excluding
  // top and bottom margins.
  var elementHeight = threadElement.getBoundingClientRect().height;

  // Get the bottom margin of the element. style.margin{Side} will return
  // values of the form 'Npx', from which we extract 'N'.
  var marginHeight = parseFloat(style.marginTop) +
                     parseFloat(style.marginBottom);

  return elementHeight + marginHeight;
}

var virtualThreadOptions = {
  // identify the thread types that need to be rendered
  // but not actually visible to the user
  invisibleThreadFilter: function(thread){
    // new highlights should always get rendered so we don't
    // miss saving them via the render-save process
    return thread.annotation.$highlight && metadata.isNew(thread.annotation);
  },
};

// @ngInject
function ThreadListController($element, $scope, VirtualThreadList) {
  // `visibleThreads` keeps track of the subset of all threads matching the
  // current filters which are in or near the viewport and the view then renders
  // only those threads, using placeholders above and below the visible threads
  // to reserve space for threads which are not actually rendered.
  var self = this;

  // `scrollRoot` is the `Element` to scroll when scrolling a given thread into
  // view.
  //
  // For now there is only one `<thread-list>` instance in the whole
  // application so we simply require the scroll root to be annotated with a
  // specific class. A more generic mechanism was removed due to issues in
  // Firefox. See https://github.com/hypothesis/client/issues/341
  this.scrollRoot = document.querySelector('.js-thread-list-scroll-root');

  var options = Object.assign({
    scrollRoot: this.scrollRoot,
  }, virtualThreadOptions);

  var visibleThreads = new VirtualThreadList($scope, window, this.thread, options);
  visibleThreads.on('changed', function (state) {
    self.virtualThreadList = {
      visibleThreads: state.visibleThreads,
      invisibleThreads: state.invisibleThreads,
      offscreenUpperHeight: state.offscreenUpperHeight + 'px',
      offscreenLowerHeight: state.offscreenLowerHeight + 'px',
    };

    scopeTimeout($scope, function () {
      state.visibleThreads.forEach(function (thread) {
        var height = getThreadHeight(thread.id);
        if (!height) {
          return;
        }
        visibleThreads.setThreadHeight(thread.id, height);
      });
    }, 50);
  });

  /**
   * Return the vertical scroll offset for the document in order to position the
   * annotation thread with a given `id` or $tag at the top-left corner
   * of the view.
   */
  function scrollOffset(id) {
    var maxYOffset = self.scrollRoot.scrollHeight - self.scrollRoot.clientHeight;
    return Math.min(maxYOffset, visibleThreads.yOffsetOf(id));
  }

  /** Scroll the annotation with a given ID or $tag into view. */
  function scrollIntoView(id) {
    var estimatedYOffset = scrollOffset(id);
    self.scrollRoot.scrollTop = estimatedYOffset;

    // As a result of scrolling the sidebar, the target scroll offset for
    // annotation `id` might have changed as a result of:
    //
    // 1. Heights of some cards above `id` changing from an initial estimate to
    //    an actual measured height after the card is rendered.
    // 2. The height of the document changing as a result of any cards heights'
    //    changing. This may affect the scroll offset if the original target
    //    was near to the bottom of the list.
    //
    // So we wait briefly after the view is scrolled then check whether the
    // estimated Y offset changed and if so, trigger scrolling again.
    scopeTimeout($scope, function () {
      var newYOffset = scrollOffset(id);
      if (newYOffset !== estimatedYOffset) {
        scrollIntoView(id);
      }
    }, 200);
  }

  $scope.$on(events.BEFORE_ANNOTATION_CREATED, function (event, annotation) {
    if (annotation.$highlight || metadata.isReply(annotation)) {
      return;
    }
    self.onClearSelection();
    scrollIntoView(annotation.$tag);
  });

  this.$onChanges = function (changes) {
    if (changes.thread) {
      visibleThreads.setRootThread(changes.thread.currentValue);
    }
  };

  this.$onDestroy = function () {
    visibleThreads.detach();
  };
}

module.exports = {
  controller: ThreadListController,
  controllerAs: 'vm',
  bindings: {
    /** The root thread to be displayed by the thread list. */
    thread: '<',
    showDocumentInfo: '<',

    /**
     * Called when the user clicks a link to show an annotation that does not
     * match the current filter.
     */
    onForceVisible: '&',
    /** Called when the user focuses an annotation by hovering it. */
    onFocus: '&',
    /** Called when a user selects an annotation. */
    onSelect: '&',
    /** Called when a user toggles the expansion state of an annotation thread. */
    onChangeCollapsed: '&',
    /** Called to clear the current selection. */
    onClearSelection: '&',
  },
  template: require('../templates/thread_list.html'),
};
