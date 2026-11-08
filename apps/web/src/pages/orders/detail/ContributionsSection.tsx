import { useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Modal, Table } from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { canPerform, formatDateTime, formatPen, whyBlocked } from '@izumi/contracts';
import type { Contribution, Feasibility, Order } from '@izumi/contracts';
import { ContributionForm } from './ContributionForm';
import { reasonKind, reasonSupplierId } from './feasibilityReasons';
import { useSupplierNameResolver, useSuppliers } from './useSupplierOptions';

interface Props {
  order: Order;
  feasibility: Feasibility;
  onChanged: () => void;
}

/** Table of order.contributions, each row flagged with whatever feasibility complains about it. */
export function ContributionsSection({ order, feasibility, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const suppliersQuery = useSuppliers();
  const resolveSupplierName = useSupplierNameResolver(suppliersQuery.data);

  const flagsBySupplier = new Map<string, Set<'mismatch' | 'late' | 'expired'>>();
  for (const reason of feasibility.reasons) {
    const kind = reasonKind(reason);
    if (kind !== 'mismatch' && kind !== 'late' && kind !== 'expired') continue;
    const supplierId = reasonSupplierId(reason);
    if (!supplierId) continue;
    const flags = flagsBySupplier.get(supplierId) ?? new Set();
    flags.add(kind);
    flagsBySupplier.set(supplierId, flags);
  }

  const allowed = canPerform(order.status, 'contribute');
  const blockedReason = whyBlocked(order.status, 'contribute');

  const columns: TableColumn<Contribution>[] = [
    { key: 'supplier', header: 'Proveedor', render: (row) => resolveSupplierName(row.supplierId) },
    { key: 'quantity', header: 'Cantidad', render: (row) => row.quantity, align: 'right' },
    { key: 'unitCost', header: 'Costo unitario', render: (row) => formatPen(row.unitCostCents), align: 'right' },
    {
      key: 'total',
      header: 'Total',
      render: (row) => formatPen(row.unitCostCents * row.quantity),
      align: 'right',
    },
    { key: 'availableAt', header: 'Disponible desde', render: (row) => formatDateTime(row.availableAt) },
    { key: 'validUntil', header: 'Válido hasta', render: (row) => formatDateTime(row.validUntil) },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => {
        const flags = flagsBySupplier.get(row.supplierId) ?? new Set();
        return (
          <div className="order-detail__contribution-flags">
            <Badge tone={row.confirmed ? 'success' : 'warning'}>
              {row.confirmed ? 'Confirmado' : 'Sin confirmar'}
            </Badge>
            {flags.has('mismatch') ? <Badge tone="danger">Especificación no coincide</Badge> : null}
            {flags.has('late') ? <Badge tone="warning">Entrega tardía</Badge> : null}
            {flags.has('expired') ? <Badge tone="danger">Vencido</Badge> : null}
          </div>
        );
      },
    },
  ];

  return (
    <Card className="order-detail__contributions">
      <CardHeader
        title="Aportes"
        actions={
          <Button size="sm" onClick={() => setOpen(true)} disabled={!allowed}>
            Agregar aporte
          </Button>
        }
      />
      <CardBody>
        {!allowed && blockedReason ? <p className="order-detail__hint">{blockedReason}</p> : null}
        <Table
          columns={columns}
          rows={order.contributions}
          keyExtractor={(row) => row.id}
          emptyContent={<p>Todavía no hay aportes registrados.</p>}
        />
      </CardBody>

      <Modal open={open} onClose={() => setOpen(false)} title="Agregar aporte" size="lg">
        <ContributionForm
          order={order}
          onSuccess={() => {
            setOpen(false);
            onChanged();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </Card>
  );
}
