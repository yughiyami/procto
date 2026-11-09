import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import type { Order, Supplier } from '@izumi/contracts';
import { supplierSchema, formatPen } from '@izumi/contracts';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Table,
  useToast,
} from '@izumi/ui';
import type { TableColumn } from '@izumi/ui';
import { apiClient, store } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './SuppliersPage.css';

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function CopyIdButton({ id }: { id: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.show({ tone: 'success', message: 'ID copiado al portapapeles.' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show({ tone: 'danger', message: 'No se pudo copiar el ID. Cópialo manualmente.' });
    }
  }

  return (
    <button
      type="button"
      className="suppliers__copy-id"
      onClick={() => void handleCopy()}
      aria-label={`Copiar ID completo del proveedor: ${id}`}
      title={id}
    >
      <code>{shortId(id)}</code>
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
    </button>
  );
}

interface AddSupplierModalProps {
  open: boolean;
  onClose: () => void;
}

function AddSupplierModal({ open, onClose }: AddSupplierModalProps) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [domainError, setDomainError] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (input: { name: string }) => apiClient.createSupplier(input),
    onSuccess: async () => {
      toast.show({ tone: 'success', message: 'Proveedor agregado.' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      handleClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.kind === 'invalid_input') {
        const errors = error.fieldErrors();
        setFieldError(errors.name ?? 'El nombre no es válido.');
        return;
      }
      if (error instanceof ApiError && error.kind === 'domain') {
        setDomainError(error.userMessage());
        return;
      }
      setDomainError(error instanceof ApiError ? error.userMessage() : 'No se pudo agregar el proveedor.');
    },
  });

  function handleClose() {
    setName('');
    setFieldError(undefined);
    setDomainError(undefined);
    mutation.reset();
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);
    setDomainError(undefined);
    const parsed = supplierSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'El nombre no es válido.');
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agregar proveedor"
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" form="add-supplier-form" loading={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="add-supplier-form" onSubmit={handleSubmit} noValidate>
        <p className="suppliers__modal-note">
          Este proveedor queda registrado como un contacto en tu red. Agregarlo no le envía
          ninguna notificación, no verifica su identidad ni le crea una cuenta: solo lo deja
          disponible para invitarlo a contribuir en un pedido.
        </p>
        {domainError ? (
          <Alert tone="danger" title="No se pudo guardar">
            {domainError}
          </Alert>
        ) : null}
        <Field label="Nombre del proveedor" htmlFor="supplier-name" required error={fieldError}>
          <Input
            id="supplier-name"
            name="name"
            value={name}
            maxLength={200}
            error={Boolean(fieldError)}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

function SuppliersTable({ suppliers }: { suppliers: Supplier[] }) {
  const ordersQuery = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(term));
  }, [suppliers, search]);

  const columns: TableColumn<Supplier>[] = [
    { key: 'name', header: 'Nombre', render: (row) => row.name },
    { key: 'id', header: 'ID', render: (row) => <CopyIdButton id={row.id} /> },
  ];

  return (
    <div className="suppliers__list">
      {suppliers.length > 8 ? (
        <div className="suppliers__search">
          <Input
            type="search"
            placeholder="Buscar proveedor por nombre…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar proveedor por nombre"
          />
        </div>
      ) : null}
      <QueryBoundary query={ordersQuery}>{orders => <div className="suppliers__performance">
        <p>Participación real en los pedidos cargados (máximo 100). Los aportes no son ventas cobradas; las entregas no se atribuyen a un proveedor individual.</p>
        {orders.length >= 100 && <Alert tone="warning" title="Vista parcial">Puede haber pedidos anteriores no incluidos.</Alert>}
        {filtered.map(supplier => <SupplierPerformance key={supplier.id} supplier={supplier} orders={orders} />)}
      </div>}</QueryBoundary>
      <details><summary>Identificadores de proveedores</summary><Table
        columns={columns}
        rows={filtered}
        keyExtractor={(row) => row.id}
        emptyContent={
          <p className="suppliers__no-match">Ningún proveedor coincide con “{search}”.</p>
        }
      /></details>
    </div>
  );
}

function SupplierPerformance({ supplier, orders }: { supplier: Supplier; orders: Order[] }) {
  const related = orders.filter(order => order.contributions.some(c => c.supplierId === supplier.id));
  const active = related.filter(order => order.status !== 'cancelled');
  const contributions = active.flatMap(order => order.contributions.filter(c => c.supplierId === supplier.id));
  const confirmed = contributions.filter(c => c.confirmed);
  const cost = confirmed.reduce((sum, c) => sum + c.quantity * c.unitCostCents, 0);
  const pending = contributions.length - confirmed.length;
  const wallet = store.supplierWallet(supplier.id);
  return <article className="suppliers__performance-card">
    <h2>{supplier.name}</h2>
    <dl><div><dt>Pedidos no cancelados</dt><dd>{active.length}</dd></div>
    <div><dt>Aportes por confirmar</dt><dd>{pending}</dd></div>
    <div><dt>Valor de aportes confirmados</dt><dd>{formatPen(cost)}</dd></div></dl>
    <p>No equivale a facturación ni pagos recibidos.</p>
    <details><summary>Ver {related.length} pedidos relacionados</summary>
      {related.length ? <ul>{related.map(order => <li key={order.id}><Link to={`/orders/${order.id}`}>{order.title}</Link>{order.status === 'cancelled' ? ' · Cancelado' : ''}</li>)}</ul> : <p>Aún no participa en pedidos. Invítalo desde un pedido compartido.</p>}
    </details>
    <p>
      {wallet ? (
        <Link to={`/ficha/${wallet}`}>Ver ficha de cumplimiento</Link>
      ) : (
        'Ficha de cumplimiento: aparece cuando el taller cobra su primer pedido protegido.'
      )}
    </p>
    <Link to="/orders">Coordinar un pedido</Link>
  </article>;
}

export default function SuppliersPage() {
  useDocumentTitle('Proveedores');
  const [modalOpen, setModalOpen] = useState(false);
  const query = useQuery({ queryKey: queryKeys.suppliers.all, queryFn: apiClient.listSuppliers });

  return (
    <div className="suppliers">
      <PageHeader
        title="Proveedores"
        subtitle="Tu red de contactos para pedir contribuciones a un pedido colectivo."
        actions={
          <Button onClick={() => setModalOpen(true)}>Agregar proveedor</Button>
        }
      />

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.length === 0}
        emptyFallback={
          <EmptyState
            title="Todavía no tienes proveedores"
            description={
              <>
                Un proveedor debe existir aquí antes de poder invitarlo a contribuir a un{' '}
                <Link to="/orders">pedido</Link>. Agrégalo y luego genera una invitación desde el
                detalle del pedido.
              </>
            }
            action={<Button onClick={() => setModalOpen(true)}>Agregar proveedor</Button>}
          />
        }
      >
        {(suppliers) => <SuppliersTable suppliers={suppliers} />}
      </QueryBoundary>

      <AddSupplierModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
