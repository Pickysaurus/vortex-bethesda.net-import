import { actions, log, selectors, types } from 'vortex-api';
import * as path from 'path';
import BethesdaImport from './views/BethesdaImport';

const supportedGameIds = ['skyrimse', 'fallout4'];

function main(context: types.IExtensionContext) {
  // Abort for non-windows installs. 
  if (process.platform !== "win32") return false;

  // Register our import dialog
  context.registerDialog('bethesda-net-import', BethesdaImport);

  // Add an import button to the mods tab.
  context.registerAction('mod-icons', 120, 'import', {}, 'Import From Bethesda.net', () => {
    context.api.store.dispatch(actions.setDialogVisible('bethesda-net-import'));
  }, (instanceIds) => {
    // Make sure this is a game we know can have Bethesda.net mods
    const gameId = selectors.activeGameId(context.api.store.getState());
    return supportedGameIds.includes(gameId);
  });

  context.once(() => {
    // Import our custom styles
    context.api.setStylesheet('bethesda-net-import', path.join(__dirname, 'bethesda-net-import.scss'));
  });

  return true;
}

export default main;
