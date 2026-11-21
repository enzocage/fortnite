import type {
  AmmoType,
  ItemInstance,
  MaterialType,
  WeaponId,
} from '../types';
import { MAX_MATS, WEAPONS, clamp } from '../core';

export interface AddItemResult {
  added: boolean;
  swappedOut: ItemInstance | null;
  slotIndex: number;
}

export interface DroppedLootPayload {
  items: ItemInstance[];
  ammo: Partial<Record<AmmoType, number>>;
  materials: Partial<Record<MaterialType, number>>;
}

function createPickaxeItem(): ItemInstance {
  return {
    uid: 'slot_0_pickaxe',
    weaponId: 'pickaxe',
    rarity: 'common',
    magAmmo: 0,
    stackCount: 1,
  };
}

export class InventorySystem {
  public slots: (ItemInstance | null)[] = [
    createPickaxeItem(),
    null,
    null,
    null,
    null,
    null,
  ];

  public ammo: Record<AmmoType, number> = {
    light: 0,
    medium: 0,
    shells: 0,
    heavy: 0,
    rockets: 0,
  };

  public materials: Record<MaterialType, number> = {
    wood: 0,
    brick: 0,
    metal: 0,
  };

  public activeSlot = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.slots = [createPickaxeItem(), null, null, null, null, null];
    this.ammo = {
      light: 0,
      medium: 0,
      shells: 0,
      heavy: 0,
      rockets: 0,
    };
    this.materials = {
      wood: 0,
      brick: 0,
      metal: 0,
    };
    this.activeSlot = 0;
  }

  getSlots(): (ItemInstance | null)[] {
    return this.slots;
  }

  getSlot(index: number): ItemInstance | null {
    if (index < 0 || index >= this.slots.length) return null;
    return this.slots[index];
  }

  getActiveSlotIndex(): number {
    return this.activeSlot;
  }

  setActiveSlot(index: number): boolean {
    if (index < 0 || index >= this.slots.length) return false;
    this.activeSlot = index;
    return true;
  }

  getActiveItem(): ItemInstance | null {
    return this.slots[this.activeSlot] ?? null;
  }

  findSlotByWeapon(weaponId: WeaponId): number {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]?.weaponId === weaponId) {
        return i;
      }
    }
    return -1;
  }

  addItem(item: ItemInstance): AddItemResult {
    if (item.weaponId === 'pickaxe') {
      return { added: false, swappedOut: null, slotIndex: 0 };
    }

    const def = WEAPONS[item.weaponId];
    let remainingStack = Math.max(1, item.stackCount || 1);

    // 1. Merge into existing stackable consumable or throwable slots
    if ((def.isConsumable || def.isThrowable) && def.maxStack > 1) {
      let mergedSlot = -1;
      for (let i = 1; i < this.slots.length; i++) {
        const existing = this.slots[i];
        if (
          existing &&
          existing.weaponId === item.weaponId &&
          existing.stackCount < def.maxStack
        ) {
          const room = def.maxStack - existing.stackCount;
          const transfer = Math.min(room, remainingStack);
          existing.stackCount += transfer;
          remainingStack -= transfer;
          mergedSlot = i;
          if (remainingStack <= 0) {
            return { added: true, swappedOut: null, slotIndex: i };
          }
        }
      }

      // Place remaining overflow in first empty slot
      for (let i = 1; i < this.slots.length; i++) {
        if (!this.slots[i]) {
          this.slots[i] = {
            ...item,
            stackCount: Math.min(remainingStack, def.maxStack),
          };
          remainingStack -= this.slots[i]!.stackCount;
          if (remainingStack <= 0) {
            return { added: true, swappedOut: null, slotIndex: i };
          }
        }
      }

      if (mergedSlot !== -1) {
        return {
          added: true,
          swappedOut: { ...item, stackCount: remainingStack },
          slotIndex: mergedSlot,
        };
      }
    }

    // 2. First empty slot in 1..5
    for (let i = 1; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = {
          ...item,
          stackCount: clamp(remainingStack, 1, def.maxStack),
        };
        return { added: true, swappedOut: null, slotIndex: i };
      }
    }

    // 3. Full inventory: swap with active slot if holding slot 1..5
    if (this.activeSlot >= 1 && this.activeSlot < this.slots.length) {
      const prev = this.slots[this.activeSlot];
      this.slots[this.activeSlot] = {
        ...item,
        stackCount: clamp(remainingStack, 1, def.maxStack),
      };
      return {
        added: true,
        swappedOut: prev,
        slotIndex: this.activeSlot,
      };
    }

    return { added: false, swappedOut: null, slotIndex: -1 };
  }

  removeSlot(index: number): ItemInstance | null {
    if (index <= 0 || index >= this.slots.length) return null;
    const removed = this.slots[index];
    this.slots[index] = null;
    return removed;
  }

  consumeActiveItem(): boolean {
    if (this.activeSlot <= 0) return false;
    const item = this.slots[this.activeSlot];
    if (!item) return false;
    const def = WEAPONS[item.weaponId];
    if (!def.isConsumable && !def.isThrowable) return false;

    item.stackCount -= 1;
    if (item.stackCount <= 0) {
      this.slots[this.activeSlot] = null;
    }
    return true;
  }

  addAmmo(type: AmmoType, amount: number): number {
    if (amount <= 0) return this.ammo[type];
    const next = clamp(this.ammo[type] + Math.floor(amount), 0, 999);
    this.ammo[type] = next;
    return next;
  }

  useAmmo(type: AmmoType, amount: number): number {
    if (amount <= 0) return 0;
    const available = this.ammo[type];
    const taken = Math.min(available, Math.floor(amount));
    this.ammo[type] = available - taken;
    return taken;
  }

  getAmmo(type: AmmoType): number {
    return this.ammo[type] ?? 0;
  }

  getAllAmmo(): Record<AmmoType, number> {
    return { ...this.ammo };
  }

  addMaterial(type: MaterialType, amount: number): number {
    if (amount <= 0) return this.materials[type];
    const next = clamp(this.materials[type] + Math.floor(amount), 0, MAX_MATS);
    this.materials[type] = next;
    return next;
  }

  spendMaterial(type: MaterialType, amount: number): boolean {
    if (amount <= 0) return true;
    if (this.materials[type] < amount) return false;
    this.materials[type] -= amount;
    return true;
  }

  getMaterials(): Record<MaterialType, number> {
    return { ...this.materials };
  }

  getTotalMaterials(): number {
    return this.materials.wood + this.materials.brick + this.materials.metal;
  }

  reloadSlot(slotIndex: number): number {
    if (slotIndex <= 0 || slotIndex >= this.slots.length) return 0;
    const item = this.slots[slotIndex];
    if (!item) return 0;
    const def = WEAPONS[item.weaponId];
    if (!def.ammoType || def.magSize <= 0) return 0;

    const needed = def.magSize - item.magAmmo;
    if (needed <= 0) return 0;

    const loaded = this.useAmmo(def.ammoType, needed);
    item.magAmmo += loaded;
    return loaded;
  }

  dropAllLoot(): DroppedLootPayload {
    const items: ItemInstance[] = [];
    for (let i = 1; i < this.slots.length; i++) {
      const item = this.slots[i];
      if (item) {
        items.push({ ...item });
        this.slots[i] = null;
      }
    }

    const ammo: Partial<Record<AmmoType, number>> = {};
    (Object.keys(this.ammo) as AmmoType[]).forEach((k) => {
      if (this.ammo[k] > 0) {
        ammo[k] = this.ammo[k];
        this.ammo[k] = 0;
      }
    });

    const materials: Partial<Record<MaterialType, number>> = {};
    (Object.keys(this.materials) as MaterialType[]).forEach((k) => {
      if (this.materials[k] > 0) {
        materials[k] = this.materials[k];
        this.materials[k] = 0;
      }
    });

    this.activeSlot = 0;
    return { items, ammo, materials };
  }
}
