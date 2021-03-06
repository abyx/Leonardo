angular.module('leonardo', ['leonardo.templates', 'ngMockE2E'])
  .config(['$provide', '$httpProvider', function($provide, $httpProvider) {

    $httpProvider.interceptors.push('leoHttpInterceptor');

    $provide.decorator('$httpBackend', ['$delegate', '$timeout', function($delegate, $timeout) {
      var proxy = function(method, url, data, callback, headers) {
        var interceptor = function() {
          var _this = this,
            _arguments = arguments;
          $timeout(function() {
            callback.apply(_this, _arguments);
          }, proxy.delay || 0);
          proxy.delay = 0;
        };
        return $delegate.call(this, method, url, data, interceptor, headers);
      };

      for(var key in $delegate) {
        if ($delegate.hasOwnProperty(key)) {
          proxy[key] = $delegate[key];
        }
      }

      proxy.setDelay = function(delay) {
        proxy.delay = delay;
      };

      return proxy;
    }]);

    $provide.decorator('$http', ['leoConfiguration', '$delegate', function(leoConfiguration, $delegate) {
      var proxy = function(requestConfig) {
        leoConfiguration._requestSubmitted(requestConfig);
        return $delegate.call(this, requestConfig);
      };

      for(var key in $delegate) {
        if ($delegate.hasOwnProperty(key)) {
          proxy[key] = $delegate[key];
        }
      }

      createShortMethodsWithData('post', 'put', 'patch');

      createShortMethods('get', 'delete', 'head', 'jsonp');

      function createShortMethods() {
        angular.forEach(arguments, function(name) {
          proxy[name] = function(url, config) {
            return proxy(angular.extend({}, config || {}, {
              method: name,
              url: url
            }));
          };
        });
      }

      function createShortMethodsWithData() {
        angular.forEach(arguments, function(name) {
          proxy[name] = function(url, data, config) {
            return proxy(angular.extend({}, config || {}, {
              method: name,
              url: url,
              data: data
            }));
          };
        });
      }

      return proxy;
    }]);
  }]);
angular.module('leonardo').factory('leoConfiguration',
    ['leoStorage', '$httpBackend', function(leoStorage, $httpBackend) {
  var states = [],
      _scenarios = {},
      responseHandlers = {},
      _requestsLog = {},
      // Core API
      // ----------------
      api = {
        // Add a new state which you wish to mock - there a two types of states - one with url and one without.
        addState: addState,
        addStates: addStates,
        getState: getState,
        getStates: fetchStates,
        deactivateState: deactivateState,
        deactivateAllStates: deactivateAll,
        activateStateOption: activateStateOption,
        addScenario: addScenario,
        addScenarios: addScenarios,
        getScenario: getScenario,
        getScenarios: getScenarios,
        setActiveScenario: setActiveScenario,
        getUnregisteredStates: getUnregisteredStates,
        //Private api for passing through unregistered urls to $htto
        _requestSubmitted: requestSubmitted,
        _logRequest: logRequest
      };
  return api;

  function upsertOption(state, name, active) {
    var _states = leoStorage.getStates();
    _states[state] = {
      name: name || findStateOption(state).name,
      active: active
    };

    leoStorage.setStates(_states);

    sync();
  }

  function fetchStatesByUrl(url){
   return fetchStates().filter(function(state){
    return state.url === url;
   });
  }

  function fetchStates(){
    var activeStates = leoStorage.getStates();
    var _states = states.map(function(state) {
      return angular.copy(state);
    });

    _states.forEach(function(state) {
      var option = activeStates[state.name];
      state.active = !!option && option.active;
      state.activeOption = !!option ?
        state.options.filter(function (_option) {
          return _option.name === option.name;
        })[0] : state.options[0];
    });

    return _states;
  }

  function deactivateAll() {
    var _states = leoStorage.getStates();
    Object.keys(_states).forEach(function(stateKey) {
      _states[stateKey].active = false;
    });
    leoStorage.setStates(_states);

    sync();
  }

  function findStateOption(name){
    return fetchStates().filter(function(state){ return state.name === name;})[0].activeOption;
  }

  function sync(){
    fetchStates().forEach(function (state) {
      var option, responseHandler;
      if (state.url) {
        option = findStateOption(state.name);
        responseHandler = getResponseHandler(state);
        if (state.active) {
          responseHandler.respond(function () {
            $httpBackend.setDelay(option.delay);
            return [option.status, angular.isFunction(option.data) ? option.data() : option.data];
          });
        } else {
          responseHandler.passThrough();
        }
      }
    });
  }

  function getResponseHandler(state) {
    var url = state.url;
    var verb = state.verb === 'jsonp' ? state.verb : state.verb.toUpperCase();

    if (!responseHandlers[url + '_' + verb]) {
      if (state.verb === 'jsonp'){
        responseHandlers[url + '_' + verb] = $httpBackend.whenJSONP(new RegExp(url));
      }
      else {
        responseHandlers[url + '_' + verb] = $httpBackend.when(verb || 'GET', new RegExp(url));
      }
    }
    return responseHandlers[url + '_' + verb];
  }

  function getState(name){
    var state = fetchStates().filter(function(state) { return state.name === name})[0];
    return (state && state.active && findStateOption(name)) || null;
  }

  function addState(stateObj) {
    stateObj.options.forEach(function (option) {
      upsert({
        state: stateObj.name,
        url: stateObj.url,
        verb: stateObj.verb,
        name: option.name,
        status: option.status,
        data: option.data,
        delay: option.delay
      });
    });
  }

  function addStates(statesArr) {
    statesArr.forEach(function(stateObj) {
      addState(stateObj);
    });
  }

  function upsert(stateObj) {
    var verb = stateObj.verb || 'GET',
        state = stateObj.state,
        name = stateObj.name,
        url = stateObj.url,
        status = stateObj.status || 200,
        data = stateObj.data || {},
        delay = stateObj.delay || 0;
    var defaultState = {};

    var defaultOption = {};

    if (!state) {
      console.log("cannot upsert - state is mandatory");
      return;
    }

    var stateItem = states.filter(function(_state) { return _state.name === state;})[0] || defaultState;

    angular.extend(stateItem, {
      name: state,
      url: url || stateItem.url,
      verb: verb,
      options: stateItem.options || []
    });


    if (stateItem === defaultState) {
      states.push(stateItem);
    }

    var option = stateItem.options.filter(function(_option) {return _option.name === name})[0] || defaultOption;

    angular.extend(option, {
      name: name,
      status: status,
      data: data,
      delay: delay
    });

    if (option === defaultOption) {
      stateItem.options.push(option);
    }
    sync();
  }

  function upsertMany(items){
    items.forEach(function(item) {
      upsert(item);
    });
  }

  function addScenario(scenario){
    if (scenario && typeof scenario.name === 'string') {
      _scenarios[scenario.name] = scenario;
    } else {
      throw 'addScnerio method expects a scenario object with name property';
    }
  }

  function addScenarios(scenarios){
    angular.forEach(scenarios, addScenario);
  }

  function getScenarios(){
    return Object.keys(_scenarios);
  }

  function getScenario(name){
    console.log(name);
    if (!_scenarios[name]) {
      return;
    }
    console.log('return scenario', _scenarios[name].states);
    return _scenarios[name].states;
  }

  function setActiveScenario(name){
    deactivateAll();
    getScenario(name).forEach(function(state){
      upsertOption(state.name, state.option, true);
    });
  }

  function activateStateOption(state, optionName) {
    upsertOption(state, optionName, true);
  }

  function deactivateState(state) {
    upsertOption(state, null, false);
  }

  function requestSubmitted(requestConfig){
    var state = fetchStatesByUrl(requestConfig.url)[0];
    var handler = getResponseHandler(state || {
        url: requestConfig.url,
        verb:  requestConfig.method
      });
    if (!state) {
      handler.passThrough();
    }
  }

  function logRequest(method, url, data, status) {
    if (method && url && !(url.indexOf(".html") > 0)) {
      _requestsLog[method.toUpperCase() + " " + url.trim()] = {
        verb: method,
        data: data,
        url: url.trim(),
        status: status
      };
    }
  }

 function isRequestRegistered(_states, req) {
   return _states.some(function(state) {
     if (!state.url) return false;
     return state.url === req.url && state.verb.toLowerCase() === req.verb.toLowerCase() ;
   });
 }

  function getUnregisteredStates() {
    var _states = fetchStates(),
        requestsArr = Object.keys(_requestsLog)
          .filter(function(key) {
            return !isRequestRegistered(_states, _requestsLog[key]);
          })
          .map(function(key){
            var req = _requestsLog[key];
            return {
              name: key,
              verb: req.verb,
              url: req.url,
              options: [{
                name: req.status >= 200 && req.status < 300 ? 'Success' : 'Failure',
                status: req.status,
                data: req.data
              }]
            }
          });
    console.log(angular.toJson(requestsArr, true));
    return requestsArr;
  }
}]);

angular.module('leonardo').factory('leoHttpInterceptor', ['leoConfiguration', function(leoConfiguration) {
  return {
    'request': function(request) {
      leoConfiguration._logRequest(request.method, request.url);
      return request;
    },
    'response': function(response) {
      leoConfiguration._logRequest(response.config.method, response.config.url, response.data, response.status);
      return response;
    },
    'responseError': function(rejection) {
      leoConfiguration._logRequest(rejection.config.method, rejection.config.url, rejection.data, rejection.status);
      return rejection;
    }
  };
}]);

angular.module('leonardo').factory('leoStorage', ['$rootScope', '$window', function storageService($rootScope, $window) {
  var STATES_STORE_KEY = 'leonardo-states';
  function getItem(key) {
    var item = $window.localStorage.getItem(key);
    if (!item) {
      return null;
    }
    return angular.fromJson(item);
  }

  function setItem(key, data) {
    $window.localStorage.setItem(key, angular.toJson(data));
  }

  function getStates() {
    return getItem(STATES_STORE_KEY) || {};
  }

  function setStates(states) {
    setItem(STATES_STORE_KEY, states);
    $rootScope.$emit('leonardo:setStates');
  }

  return {
    getItem: getItem,
    setItem: setItem,
    setStates: setStates,
    getStates: getStates
  };
}]);

angular.module('leonardo').directive('leoActivator', ['$compile', function activatorDirective($compile) {
  return {
    restrict: 'A',
    link: function(scope, elem) {
      var el = angular.element('<div ng-click="activate()" class="leonardo-activator"></div>');

      var win = angular.element([
      '<div class="leonardo-window">',
        '<div class="leonardo-header">',
          '<div class="menu">',
            '<ul>',
              '<li>LEONARDO</li>', 
              '<li>Scenarios</li>', 
            '</ul>',
          '</div>',
        '</div>',
        '<leo-window-body></leo-window-body>',
        '</div>',
      '</div>'
      ].join(''));

      $compile(el)(scope);
      $compile(win)(scope);

      elem.append(el);
      elem.append(win);

      win[0].addEventListener( 'webkitTransitionEnd', function() {
        if (!document.body.classList.contains('pull-top')){
          document.body.classList.add("pull-top-closed");
        }
      }, false );

      scope.activate = function(){
        if (!document.body.classList.contains('pull-top')) {
          document.body.classList.add('pull-top');
          document.body.classList.remove('pull-top-closed');
        }
        else {
          document.body.classList.remove('pull-top');
        }
      };
    }
  };
}]);

angular.module('leonardo').directive('leoWindowBody',
    ['$http', 'leoConfiguration', function windowBodyDirective($http, leoConfiguration) {
  return {
    restrict: 'E',
    templateUrl: 'window-body.html',
    scope: true,
    replace: true,
    controller: ['$scope', function($scope){
      $scope.selectedItem = 'activate';
      $scope.NothasUrl = function(option){
        return !option.url;
      };
      $scope.hasUrl = function(option){
        return !!option.url;
      };

      $scope.deactivate = function() {
        $scope.states.forEach(function(state){
            state.active = false;
        });
        leoConfiguration.deactivateAllStates();
      };

      $scope.updateState = function(state){
        if (state.active) {
          console.log('activate state option:' +  state.name + ': ' + state.activeOption.name);
          leoConfiguration.activateStateOption(state.name, state.activeOption.name);
        } else {
          console.log('deactivating state: ' +  state.name);
          leoConfiguration.deactivateState(state.name);
        }
      };

      $scope.states = leoConfiguration.getStates();

      $scope.scenarios = leoConfiguration.getScenarios();

      $scope.activateScenario = function(scenario){
        $scope.activeScenario = scenario;
        leoConfiguration.setActiveScenario(scenario);
        $scope.states = leoConfiguration.getStates();
      };
    }],
    link: function(scope) {
      scope.test = {
        url: '',
        value: undefined
      };

      scope.submit = function(url){
        scope.test.value = undefined;
        scope.url = url;
        if (url) {
          $http.get(url).success(function (res) {
            scope.test.value = res;
          });
        }
      };
    }
  };
}]);

(function(module) {
try {
  module = angular.module('leonardo.templates');
} catch (e) {
  module = angular.module('leonardo.templates', []);
}
module.run(['$templateCache', function($templateCache) {
  $templateCache.put('window-body.html',
    '<div class="leonardo-window-body"><div class="leonardo-scenario-nav"><div class="leonardo-breadcrumbs">SCENARIOS > {{activeScenario}}</div><div class="leonardo-scenario-title">SCENARIOS</div></div><div ng-switch="selectedItem" class="leonardo-window-options"><div ng-switch-when="configure" class="leonardo-configure"><table><thead><tr><th>State</th><th>URL</th><th>Options</th></tr></thead><tbody><tr ng-repeat="state in states"><td>{{state.name}}</td><td>{{state.url}}</td><td><ul><li ng-repeat="option in state.options">Name: {{option.name}}<br>Status: {{option.status}}<br>Data: {{option.data}}<br></li></ul></td></tr></tbody></table></div><div ng-switch-when="activate" class="leonardo-activate"><div class="leonardo-menu"><ul><li ng-class="{ \'selected\': scenario === activeScenario }" ng-repeat="scenario in scenarios" ng-click="activateScenario(scenario)">{{scenario}}</li></ul></div><ul><li class="leo-non-ajax"><h3>Non Ajax States</h3></li><li ng-repeat="state in states | filter:NothasUrl"><div><div class="onoffswitch"><input ng-model="state.active" ng-click="updateState(state)" class="onoffswitch-checkbox" id="{{state.name}}" type="checkbox" name="{{state.name}}" value="{{state.name}}"> <label class="onoffswitch-label" for="{{state.name}}"><span class="onoffswitch-inner"></span> <span class="onoffswitch-switch"></span></label></div></div><div><h4>{{state.name}}</h4></div><div><select ng-disabled="!state.active" ng-model="state.activeOption" ng-options="option.name for option in state.options" ng-change="updateState(state)"></select></div></li><li><h3>Ajax States</h3></li><li ng-repeat="state in states | filter:hasUrl"><div><div class="onoffswitch"><input ng-model="state.active" ng-click="updateState(state)" class="onoffswitch-checkbox" id="{{state.name}}" type="checkbox" name="{{state.name}}" value="{{state.name}}"> <label class="onoffswitch-label" for="{{state.name}}"><span class="onoffswitch-inner"></span> <span class="onoffswitch-switch"></span></label></div></div><div><h4>{{state.name}}</h4>&nbsp;&nbsp; - {{state.url}}</div><div><select ng-disabled="!state.active" ng-model="state.activeOption" ng-options="option.name for option in state.options" ng-change="updateState(state)"></select></div></li></ul></div><div ng-switch-when="test" class="leonardo-test"><div><label for="url"></label>URL: <input id="url" type="text" ng-model="test.url"> <input type="button" ng-click="submit(test.url)" value="submit"></div><textarea>{{test.value | json}}</textarea></div></div></div>');
}]);
})();
