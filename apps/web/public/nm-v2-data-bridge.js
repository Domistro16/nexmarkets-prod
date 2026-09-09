(function () {
  'use strict';

  const FIXTURE_MODE = globalThis.__NEXMARKETS_FIXTURE_MODE__ === true;

  function replaceArray(target, next) {
    if (!Array.isArray(target)) return;
    target.splice(0, target.length, ...(Array.isArray(next) ? next : []));
  }

  function replaceObject(target, next) {
    if (!target || typeof target !== 'object') return;
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, next && typeof next === 'object' ? next : {});
  }

  window.__nmV2SetData = function setData(payload) {
    const data = payload || {};
    try {
      if (Object.prototype.hasOwnProperty.call(data, 'projects')) replaceArray(projects, data.projects);
      if (Object.prototype.hasOwnProperty.call(data, 'projectExperience')) replaceObject(projectExperience, data.projectExperience);
      if (Object.prototype.hasOwnProperty.call(data, 'collections')) replaceArray(collections, data.collections);
      if (Object.prototype.hasOwnProperty.call(data, 'listings')) replaceArray(listings, data.listings);
      if (Object.prototype.hasOwnProperty.call(data, 'ownedPasses')) replaceArray(ownedPasses, data.ownedPasses);
    } catch (error) {
      console.error('NexMarkets V2 data bridge failed', error);
    }
    try {
      if (data.dashboardState && typeof data.dashboardState === 'object') {
        Object.assign(dashboardState, data.dashboardState);
        dashboardState.passMeta = data.dashboardState.passMeta || {};
        dashboardState.advantages = data.dashboardState.advantages || [];
        dashboardState.listings = data.dashboardState.listings || [];
        dashboardState.launches = data.dashboardState.launches || [];
        dashboardState.earnings = data.dashboardState.earnings || {};
        dashboardState.activity = data.dashboardState.activity || [];
      }
      if (data.createData && typeof data.createData === 'object') createData = { ...createDefaultData, ...data.createData };
      if (data.selectedProject !== undefined) selectedProject = data.selectedProject;
      if (data.selectedEdition !== undefined) selectedEdition = data.selectedEdition;
      if (data.selectedListing !== undefined) selectedListing = data.selectedListing;
      Object.assign(filterState, {
        category: 'all', state: 'all', passPrice: 'all', adv: 'all', collection: 'all',
        marketPrice: 'all', utility: 'all', sort: 'recent', query: ''
      }, data.filters || {});
      if (typeof syncLaunchLifecycle === 'function') syncLaunchLifecycle();
      if (typeof updateHeader === 'function') updateHeader();
      const current = typeof currentRoute !== 'undefined' ? currentRoute : 'home';
      if (current === 'home' && typeof renderHomeSections === 'function') renderHomeSections();
      else if (current === 'discover' && typeof renderDiscover === 'function') renderDiscover();
      else if (current === 'market' && typeof renderMarket === 'function') renderMarket();
      else if (current === 'create' && typeof renderCreate === 'function') renderCreate();
      else if (current === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
      else if (current === 'owned' && typeof renderOwnedPage === 'function') renderOwnedPage();
      else if (current === 'project' && typeof renderProjectPage === 'function') renderProjectPage();
      else if (current === 'collection' && typeof renderEditionPage === 'function') renderEditionPage();
      else if (current === 'listing' && typeof renderListingPage === 'function') renderListingPage();
      else if (typeof renderHomeSections === 'function') renderHomeSections();
    } catch (error) {
      console.error('NexMarkets V2 render bridge failed', error);
    }
    return {
      projects: projects.length,
      collections: collections.length,
      listings: listings.length,
      ownedPasses: ownedPasses.length
    };
  };

  window.__nmV2GetData = function getData() {
    return { projects: projects.slice(), collections: collections.slice(), listings: listings.slice(), ownedPasses: ownedPasses.slice() };
  };
  window.__nmV2AuthorityAudit = function authorityAudit() {
    return {
      fixtureMode: FIXTURE_MODE,
      fixtureAuthoritiesReachable: FIXTURE_MODE,
      source: FIXTURE_MODE ? 'explicit-fixture-mode' : 'api-and-chain-runtime'
    };
  };
  window.__nmV2GetSelections = function getSelections() {
    return { project: selectedProject, edition: selectedEdition, listing: selectedListing, owned: selectedOwnedPassKey, route: currentRoute };
  };
  window.__nmV2CompileCreateLaunch = function compileLaunch() {
    return typeof compileCreateLaunch === 'function' ? compileCreateLaunch() : null;
  };
  window.__nmV2GetCreateData = function getCreateData() {
    return createData;
  };
  window.__nmV2UpdateCreateData = function updateCreateData(patch, options) {
    Object.assign(createData, patch && typeof patch === 'object' ? patch : {});
    if (options?.render !== false && typeof renderCreate === 'function') renderCreate();
    else if (typeof renderCreatePass === 'function') renderCreatePass();
    return createData;
  };
})();
