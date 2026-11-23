(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgentWhiskerSkins = api;
})(globalThis, function () {
  'use strict';

  function createSelection({ pets, load, save, apply, onError = console.error }) {
    let revision = 0;
    let queue = Promise.resolve();
    return {
      select(petId, { persist = true } = {}) {
        const pet = pets.find(item => item.id === petId);
        if (!pet) return Promise.resolve(null);
        const request = ++revision;
        queue = queue.then(async () => {
          if (request !== revision) return null;
          await load(pet);
          if (request !== revision) return null;
          if (persist) await save(pet.id);
          apply(pet);
          return pet;
        }).catch(error => { onError(error); return null; });
        return queue;
      },
    };
  }

  function buildSkinMenu(pets, selectedId, select) {
    return {
      label: 'Персонаж',
      submenu: pets.map(pet => ({
        label: pet.displayName, type: 'radio', checked: pet.id === selectedId,
        click: () => select(pet.id),
      })),
    };
  }

  return { createSelection, buildSkinMenu };
});
