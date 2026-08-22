// Loaders partages entre React.lazy() et le prechargement de la navigation.
// Un import() deja lance est reutilise par le navigateur lorsque la route
// correspondante est affichee : le clic ne doit donc plus attendre le chunk.
export const pageModules = Object.freeze({
  login: () => import("./pages/Login.jsx"),
  layout: () => import("./components/Layout.jsx"),
  forgot: () => import("./pages/Forgot.jsx"),
  reset: () => import("./pages/Reset.jsx"),
  dashboard: () => import("./pages/Dashboard.jsx"),
  fuel: () => import("./pages/Fuel.jsx"),
  importExcel: () => import("./pages/ImportExcel.jsx"),
  fuelRequests: () => import("./pages/FuelRequests.jsx"),
  carRequests: () => import("./pages/CarRequests.jsx"),
  fuelRequestsManage: () => import("./pages/FuelRequestsManage.jsx"),
  fuelRequestsRaf: () => import("./pages/FuelRequestsRaf.jsx"),
  carRequestsManage: () => import("./pages/CarRequestsManage.jsx"),
  carRequestsRaf: () => import("./pages/CarRequestsRaf.jsx"),
  calendar: () => import("./pages/CalendarView.jsx"),
  logbooks: () => import("./pages/Logbooks.jsx"),
  logbookEdit: () => import("./pages/LogbookEdit.jsx"),
  printFuel: () => import("./pages/PrintFuelRequest.jsx"),
  printCar: () => import("./pages/PrintCarRequest.jsx"),
  printLogbook: () => import("./pages/PrintLogbook.jsx"),
  meta: () => import("./pages/Meta.jsx"),
  trash: () => import("./pages/Trash.jsx"),
  users: () => import("./pages/Users.jsx"),
});

const ROUTE_LOADERS = new Map([
  ["/app", pageModules.dashboard],
  ["/app/users", pageModules.users],
  ["/app/fuel", pageModules.fuel],
  ["/app/import", pageModules.importExcel],
  ["/app/requests/fuel", pageModules.fuelRequests],
  ["/app/requests/fuel/manage", pageModules.fuelRequestsManage],
  ["/app/requests/fuel/raf", pageModules.fuelRequestsRaf],
  ["/app/requests/car", pageModules.carRequests],
  ["/app/requests/car/manage", pageModules.carRequestsManage],
  ["/app/requests/car/raf", pageModules.carRequestsRaf],
  ["/app/calendar", pageModules.calendar],
  ["/app/meta", pageModules.meta],
  ["/app/trash", pageModules.trash],
  ["/app/logbooks", pageModules.logbooks],
]);

export function preloadRoute(pathname) {
  let loader = ROUTE_LOADERS.get(pathname);
  if (!loader && pathname.startsWith("/app/logbooks/")) {
    loader = pageModules.logbookEdit;
  }
  return loader ? loader().catch(() => null) : Promise.resolve(null);
}

export function preloadRoutes(pathnames) {
  return Promise.allSettled(pathnames.map((pathname) => preloadRoute(pathname)));
}
