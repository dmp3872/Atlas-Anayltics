export type ShippingMode = 'preboarded' | 'standard';

export interface ShippingChecklistItem {
  id: string;
  title: string;
  detail: string;
}

export function resolveShippingMode(preboarded?: boolean | null): ShippingMode {
  return preboarded ? 'preboarded' : 'standard';
}

export function shippingModeLabel(mode: ShippingMode): string {
  return mode === 'preboarded'
    ? 'Preboarded · RFID pickup'
    : 'Standard ship-in';
}

export function shippingChecklist(mode: ShippingMode, orderNumber: string): ShippingChecklistItem[] {
  if (mode === 'preboarded') {
    return [
      {
        id: 'print-label',
        title: 'Print your prepaid UPS label',
        detail: 'Use the label on this order — shipping is included at no charge.',
      },
      {
        id: 'pack-vials',
        title: 'Pack vials securely',
        detail: 'Keep vials upright, cushioned, and labeled with your compound / lot names.',
      },
      {
        id: 'attach-plaque',
        title: 'Attach your RFID plaque',
        detail: 'Place the Atlas RFID plaque on the outside of the package so UPS can scan it at pickup.',
      },
      {
        id: 'affix-label',
        title: 'Affix the prepaid label',
        detail: `Stick the label on the package. Keep order ${orderNumber} visible as a secondary reference.`,
      },
      {
        id: 'ups-pickup',
        title: 'Hand off to UPS pickup',
        detail: 'UPS comes to you, scans plaque + label, and RFID-tracks the package to our Austin lab. You never pay for shipping.',
      },
    ];
  }

  return [
    {
      id: 'print-label',
      title: 'Print your prepaid shipping label',
      detail: 'Download/print the prepaid label from this order (or request one from Atlas if missing).',
    },
    {
      id: 'pack-vials',
      title: 'Pack vials securely',
      detail: 'Keep vials upright and cushioned. Include a packing slip with compound names and lot numbers.',
    },
    {
      id: 'mark-order',
      title: 'Write the order number on the box',
      detail: `Mark ${orderNumber} clearly on the outside of the package.`,
    },
    {
      id: 'affix-label',
      title: 'Affix the prepaid label',
      detail: 'Use FedEx or UPS with the prepaid label. Do not use your own paid postage unless Atlas asks you to.',
    },
    {
      id: 'drop-off',
      title: 'Drop off at a carrier location',
      detail: 'Without an RFID plaque, drop the package at FedEx/UPS yourself (or schedule your own pickup). Keep the tracking number until we mark the order received.',
    },
  ];
}
