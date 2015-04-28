// This Is A Header
// ----------------


// This is a normal comment, that will become part of the
// annotations after running through the Docco tool. Use this
// space to describe the function or other code just below
// this comment. For example:
//
// The `DoSomething` method does something! It doesn't take any
// parameters... it just does something.
function windowBodyDirective($http, configuration) {
  return {
    restrict: 'E',
    templateUrl: 'window-body.html',
    scope: true,
    replace: true,
    controllerAs: 'windowBody',
    controller: function ($scope){
      this.newUrl = {};
      this.selectedItem = 'activate';
      this.NothasUrl = function (option){
        return !option.url;
      };

      this.hasUrl = function (option){
        return !!option.url;
      };

      $scope.deactivate = function() {
        $scope.states.forEach(function(state){
            state.active = false;
        });
        configuration.deactivateAll();
      };
      this.createUrl = function () {
        configuration.upsert({state: this.newUrl.state, url: this.newUrl.url});
        this.newUrl = {};
        this.addNewUrl = false;
      }

      $scope.updateState = function(state){
        console.log(`update state: ${state.name} ${state.activeOption.name} ${state.active}`);
        configuration.upsertOption(state.name, state.activeOption.name, state.active);
      };

      configuration.fetchStates().then(function(states){
        $scope.states = states;
      });
    },
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
}

export default windowBodyDirective
