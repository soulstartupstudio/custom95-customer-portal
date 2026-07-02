import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Package, TruckIcon, X, AlertTriangle, Activity, Plus, MapPin, Zap, Clock,
  ExternalLink, User, Mail, Phone, Calendar, Filter, Search, ArrowRight, Download,
  RefreshCw, XCircle, CheckCircle2,
} from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, formatDate, formatCents, Badge, PrimaryButton, SecondaryButton } from '../components/ui'
import RequestShipmentWizard from '../components/RequestShipmentWizard'
import RestockModal from '../components/RestockModal'
import { toCsv, downloadCsv, csvDate, csvEur, fileSlug } from '../lib/csv'
import { LOW_STOCK_THRESHOLD } from '../lib/stock'

// Download the rows the customer can currently see (after filters) as a CSV.
function ExportCsvButton({ filename, columns, rows, label = 'Download CSV' }) {
  const disabled = !rows || rows.length === 0
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(columns, rows))}
      disabled={disabled}
      title={disabled ? 'Nothing to export' : `Download ${rows.length} row${rows.length === 1 ? '' : 's'} as CSV`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={13} />{label}
    </button>
  )
}

function fullAddress(a) {
  if (!a) return null
  return [
    a.label,
    [a.street, a.house_number].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter(Boolean).join(' · ')
}

// --- Inventory card with incoming ETA ---
function InventoryCard({ item, incomingEta, onClick, onRestock }) {
  const available = item.available_qty ?? 0
  const tone = available === 0 ? 'red' : available < LOW_STOCK_THRESHOLD ? 'amber' : 'gray'
  const toneClasses = { red: 'text-red-600', amber: 'text-amber-600', gray: 'text-gray-900' }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
        {item.product_photo_url ? (
          <img src={item.product_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Package size={28} className="text-gray-300" />
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-medium text-gray-900 truncate">{item.product_name}</div>
        {item.variant && <div className="text-xs text-gray-500 truncate">{item.variant}</div>}
        <div className="mt-2 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400">Available</div>
            <div className={`text-lg font-semibold ${toneClasses[tone]}`}>{available}</div>
          </div>
          {item.incoming_qty > 0 && (
            <div className="text-right">
              <div className="text-xs text-gray-400">Incoming</div>
              <div className="text-sm text-blue-600 font-medium">+{item.incoming_qty}</div>
              {incomingEta && (
                <div className="text-[10px] text-gray-500 mt-0.5 inline-flex items-center gap-0.5">
                  <Clock size={9} />ETA {formatDate(incomingEta)}
                </div>
              )}
            </div>
          )}
        </div>
        {onRestock && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRestock(item) }}
            className={`mt-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tone === 'red'
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <RefreshCw size={11} />Restock
          </button>
        )}
      </div>
    </div>
  )
}

// --- Inventory detail (enriched: destination + requester on movements) ---
function InventoryDetail({ item, ordersById, addressesById, requestByOrderId, onClose, onRestock }) {
  const [movements, setMovements] = useState([])
  useEffect(() => {
    supabase.from('warehouse_movements_client')
      .select('id, movement_type, quantity, notes, movement_date, is_reserved, reservation_label, warehouse_order_id, actor_display_name, actor_role')
      .eq('inventory_item_id', item.id)
      .order('movement_date', { ascending: false })
      .limit(20)
      .then(({ data }) => setMovements(data ?? []))
  }, [item.id])

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">{item.sku || 'Inventory'}</div>
            <h2 className="text-lg font-semibold text-gray-900">{item.product_name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onRestock && (
              <button
                type="button"
                onClick={() => onRestock(item)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
              >
                <RefreshCw size={13} />Restock
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {item.product_photo_url && (
            <img src={item.product_photo_url} alt="" className="w-full rounded-lg border border-gray-200" onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500">On hand</div><div className="text-lg font-semibold text-gray-900">{item.on_hand_qty ?? 0}</div></div>
            <div className="bg-blue-50 rounded-lg p-3"><div className="text-xs text-blue-600">Incoming</div><div className="text-lg font-semibold text-blue-700">{item.incoming_qty ?? 0}</div></div>
            <div className="bg-amber-50 rounded-lg p-3"><div className="text-xs text-amber-600">Reserved</div><div className="text-lg font-semibold text-amber-700">{item.reserved_qty ?? 0}</div></div>
            <div className="bg-green-50 rounded-lg p-3"><div className="text-xs text-green-600">Available</div><div className="text-lg font-semibold text-green-700">{item.available_qty ?? 0}</div></div>
          </div>
          {item.description && <div className="text-sm text-gray-700">{item.description}</div>}
          {item.warehouse_location && (
            <div className="text-sm text-gray-600">Location: <span className="text-gray-900">{item.warehouse_location}</span></div>
          )}
          <div>
            <div className="text-xs text-gray-500 mb-2 font-semibold">Recent movements</div>
            {movements.length === 0 ? (
              <div className="text-sm text-gray-400">No movements yet.</div>
            ) : (
              <div className="space-y-2">
                {movements.map((m) => {
                  const order = m.warehouse_order_id ? ordersById[m.warehouse_order_id] : null
                  const addr = order?.shipping_address_id ? addressesById[order.shipping_address_id] : null
                  const req = order ? requestByOrderId[order.id] : null
                  return (
                    <div key={m.id} className="py-2 px-3 text-sm border border-gray-100 rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-gray-900 capitalize">
                            {m.movement_type?.replace(/_/g, ' ')}
                            {m.is_reserved && <span className="text-xs text-amber-600 ml-1">(reserved)</span>}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatDate(m.movement_date)}
                            {m.reservation_label ? ` · ${m.reservation_label}` : ''}
                            {m.actor_display_name && (
                              <>
                                {' · '}
                                <span className="text-gray-500">by {m.actor_display_name}</span>
                                {m.actor_role && (
                                  <span className={`ml-1 inline-flex items-center text-[9px] uppercase font-medium px-1 py-0.5 rounded-full ring-1 ring-inset ${
                                    m.actor_role === 'team' ? 'text-purple-700 bg-purple-50 ring-purple-200' :
                                    m.actor_role === 'customer' ? 'text-blue-700 bg-blue-50 ring-blue-200' :
                                    'text-gray-600 bg-gray-50 ring-gray-200'
                                  }`}>{m.actor_role}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className={`font-medium ${m.movement_type === 'inbound' ? 'text-green-700' : 'text-red-600'}`}>
                          {m.movement_type === 'inbound' ? '+' : '-'}{m.quantity}
                        </div>
                      </div>
                      {(addr || req || order) && (
                        <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5 text-xs text-gray-500">
                          {order && <div>Order #{order.order_number}</div>}
                          {addr && <div className="flex items-start gap-1"><MapPin size={10} className="mt-0.5 flex-shrink-0" />{fullAddress(addr)}</div>}
                          {req?.requested_by_contact && (
                            <div className="flex items-center gap-1"><User size={10} />Requested by {req.requested_by_contact.first_name} {req.requested_by_contact.last_name}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Request card ---
function RequestCard({ request, items, onClick }) {
  const statusTone = { pending: 'yellow', approved: 'blue', fulfilled: 'green', cancelled: 'gray' }[request.status] || 'gray'
  const statusLabel = { pending: 'Pending review', approved: 'Approved', fulfilled: 'Shipped', cancelled: 'Cancelled' }[request.status] || request.status
  const requester = request.requested_by_contact
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-gray-200 p-4 text-left w-full hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">{request.ship_to_name || 'Shipment request'}</h3>
            <Badge tone={statusTone}>{statusLabel}</Badge>
            {request.shipping_speed && <Badge tone={request.shipping_speed === 'express' ? 'purple' : 'gray'}>{request.shipping_speed}</Badge>}
            {request.ship_asap && <Badge tone="blue"><Zap size={10} className="mr-0.5" />ASAP</Badge>}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <MapPin size={11} />
            {[request.ship_to_address, request.ship_to_city, request.ship_to_country].filter(Boolean).join(', ')}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100">
        <div>
          <div className="text-gray-400">Ship-out</div>
          <div className="text-gray-900 font-medium">{request.ship_asap ? 'ASAP' : formatDate(request.requested_date) || '—'}</div>
        </div>
        <div>
          <div className="text-gray-400">Recipient</div>
          <div className="text-gray-900 font-medium truncate">{request.ship_to_contact_name || '—'}</div>
        </div>
        <div>
          <div className="text-gray-400">Requested by</div>
          <div className="text-gray-900 font-medium truncate">
            {requester ? `${requester.first_name} ${requester.last_name}` : '—'}
          </div>
        </div>
      </div>
      {items?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-400 mb-1">Items ({items.reduce((s, i) => s + i.qty, 0)} units)</div>
          <div className="space-y-1">
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate">{i.warehouse_inventory?.product_name || i.inventory_id}{i.warehouse_inventory?.variant ? ` · ${i.warehouse_inventory.variant}` : ''}</span>
                <span className="font-medium text-gray-900">× {i.qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {request.notes && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-3 whitespace-pre-wrap">{request.notes}</div>
      )}
      <div className="text-[10px] text-gray-400 mt-2">Created {formatDate(request.created_at)}</div>
    </button>
  )
}

// --- Shipment detail drawer ---
function ShipmentDetail({ order, address, items, inventoryById, onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Shipment #{order.order_number}</div>
            <h2 className="text-lg font-semibold text-gray-900">{order.order_type || 'Shipment'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {order.tracking_url && (
              <a
                href={order.tracking_url.startsWith('http') ? order.tracking_url : `https://${order.tracking_url}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
              >
                <ExternalLink size={14} />Track shipment
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={order.status} />
            {order.carrier_name && <Badge>{order.carrier_name}</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-500">Ordered</div><div className="text-gray-900">{formatDate(order.order_date) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Requested arrival</div><div className="text-gray-900">{formatDate(order.requested_arrival_date) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">ATSO</div><div className="text-gray-900">{formatDate(order.atso) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">ETA</div><div className="text-gray-900 font-medium">{formatDate(order.eta) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">ATA</div><div className="text-gray-900">{formatDate(order.ata) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Owner</div><div className="text-gray-900">{order.owner || '—'}</div></div>
          </div>

          {address && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1"><MapPin size={12} />Shipping to</div>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-900">{address.label || address.street}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {[address.street, address.house_number].filter(Boolean).join(' ')}
                  {(address.postal_code || address.city) && `, ${[address.postal_code, address.city].filter(Boolean).join(' ')}`}
                  {address.country && `, ${address.country}`}
                </div>
                {address.contact_name && (
                  <div className="text-[11px] text-gray-600 mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1"><User size={10} />{address.contact_name}</span>
                    {address.contact_phone && <a href={`tel:${address.contact_phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone size={10} />{address.contact_phone}</a>}
                    {address.contact_email && <a href={`mailto:${address.contact_email}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Mail size={10} />{address.contact_email}</a>}
                  </div>
                )}
              </div>
            </div>
          )}

          {items?.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Items ({items.length})</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">SKU</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => {
                      const inv = inventoryById[m.inventory_item_id]
                      return (
                        <tr key={m.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <div className="text-gray-900">{inv?.product_name || '—'}</div>
                            {inv?.variant && <div className="text-xs text-gray-500">{inv.variant}</div>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{inv?.sku || '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.abs(m.quantity)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {order.notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Notes</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{order.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Filters bar ---
function FiltersBar({ products, productId, onProductChange, dateFrom, dateTo, onDateChange, extra }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 text-xs text-gray-500"><Filter size={12} />Filter:</div>
      <select
        value={productId}
        onChange={(e) => onProductChange(e.target.value)}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="">All products</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}{p.variant ? ` · ${p.variant}` : ''}</option>)}
      </select>
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => onDateChange({ from: e.target.value, to: dateTo })}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      <span className="text-gray-400 text-xs">→</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => onDateChange({ from: dateFrom, to: e.target.value })}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      {(productId || dateFrom || dateTo) && (
        <button
          onClick={() => { onProductChange(''); onDateChange({ from: '', to: '' }) }}
          className="text-xs text-gray-500 hover:text-gray-700 ml-1"
        >
          Clear
        </button>
      )}
      {extra}
    </div>
  )
}

// --- Main page ---
export default function WarehousePage({ company, contact, onStartProposalWithItems }) {
  const [tab, setTab] = useState('inventory')
  const [inventory, setInventory] = useState([])
  const [orders, setOrders] = useState([])
  const [movements, setMovements] = useState([])
  const [requests, setRequests] = useState([])
  const [requestItems, setRequestItems] = useState({})
  const [addressesById, setAddressesById] = useState({})
  const [shipmentMovements, setShipmentMovements] = useState({}) // order_id -> movements[]
  const [incomingEtaByInv, setIncomingEtaByInv] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedInv, setSelectedInv] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [selectedShipment, setSelectedShipment] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [restockFor, setRestockFor] = useState(null) // array of inventory ids to preselect in the restock modal
  const [refresh, setRefresh] = useState(0)

  // Filters (apply to movements + shipments tabs)
  const [productFilter, setProductFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)

      const [inv, ord, req] = await Promise.all([
        supabase.from('warehouse_inventory_client').select('*').eq('company_id', company.id).order('product_name'),
        supabase.from('warehouse_orders_client').select('*').eq('company_id', company.id).order('order_date', { ascending: false }),
        supabase.from('warehouse_requests').select('*, requested_by_contact:contacts!warehouse_requests_requested_by_contact_id_fkey(id, first_name, last_name, email, profile_image_url)').eq('company_id', company.id).order('created_at', { ascending: false }),
      ])
      if (cancelled) return

      setInventory(inv.data ?? [])
      setOrders(ord.data ?? [])
      setRequests(req.data ?? [])

      const invIds = (inv.data ?? []).map((i) => i.id)
      const ordIds = (ord.data ?? []).map((o) => o.id)

      // Movements for this company's inventory
      let movs = []
      if (invIds.length) {
        const { data } = await supabase
          .from('warehouse_movements_client')
          .select('id, movement_type, quantity, notes, movement_date, inventory_item_id, warehouse_order_id, is_reserved, reservation_label, actor_display_name, actor_role')
          .in('inventory_item_id', invIds)
          .order('movement_date', { ascending: false })
          .limit(500)
        movs = data ?? []
        if (!cancelled) setMovements(movs)
      }

      // Request items + inventory join
      const reqIds = (req.data ?? []).map((r) => r.id)
      if (reqIds.length) {
        const { data: wri } = await supabase
          .from('warehouse_request_items')
          .select('id, request_id, inventory_id, qty, warehouse_inventory:inventory_id(product_name, variant)')
          .in('request_id', reqIds)
        if (!cancelled) {
          const byReq = {}
          for (const r of wri ?? []) {
            (byReq[r.request_id] = byReq[r.request_id] || []).push(r)
          }
          setRequestItems(byReq)
        }
      }

      // Addresses for shipments
      const addrIds = [...new Set((ord.data ?? []).map((o) => o.shipping_address_id).filter(Boolean))]
      if (addrIds.length) {
        const { data: addrs } = await supabase.from('addresses').select('*').in('id', addrIds)
        if (!cancelled) {
          const byId = {}
          for (const a of addrs ?? []) byId[a.id] = a
          setAddressesById(byId)
        }
      }

      // Movements per shipment (for shipment detail item rows)
      if (ordIds.length) {
        const byOrder = {}
        for (const m of movs) {
          if (!m.warehouse_order_id) continue
          (byOrder[m.warehouse_order_id] = byOrder[m.warehouse_order_id] || []).push(m)
        }
        if (!cancelled) setShipmentMovements(byOrder)
      }

      // Incoming ETA per inventory item (earliest eta from inbound orders touching that item)
      const todayStr = new Date().toISOString().slice(0, 10)
      const incoming = (ord.data ?? []).filter((o) => o.order_type === 'inbound' && o.eta && o.eta >= todayStr)
      const etaByInv = {}
      for (const o of incoming) {
        const ms = movs.filter((m) => m.warehouse_order_id === o.id)
        for (const m of ms) {
          const current = etaByInv[m.inventory_item_id]
          if (!current || o.eta < current) etaByInv[m.inventory_item_id] = o.eta
        }
      }
      if (!cancelled) setIncomingEtaByInv(etaByInv)

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, refresh])

  if (loading) return <Spinner />

  // Stock buckets for the inventory overview (out of stock / running low / in stock)
  const outOfStock = inventory.filter((i) => (i.available_qty ?? 0) === 0)
  const runningLow = inventory.filter((i) => (i.available_qty ?? 0) > 0 && (i.available_qty ?? 0) < LOW_STOCK_THRESHOLD)
  const inStock = inventory.filter((i) => (i.available_qty ?? 0) >= LOW_STOCK_THRESHOLD)
  const invById = Object.fromEntries(inventory.map((i) => [i.id, i]))
  const canRestock = !!onStartProposalWithItems
  const openRestock = (invItems) => setRestockFor(invItems.map((i) => i.id))
  const pendingRequests = requests.filter((r) => r.status === 'pending').length

  // Derive "request by order" heuristically: none available — so just an empty map (kept for extensibility)
  const requestByOrderId = {}

  // Filtered movements
  const filteredMovements = movements.filter((m) => {
    if (productFilter && m.inventory_item_id !== productFilter) return false
    if (dateFrom && m.movement_date < dateFrom) return false
    if (dateTo && m.movement_date > dateTo + 'T23:59:59') return false
    return true
  })

  // Filtered shipments (orders)
  const filteredOrders = orders.filter((o) => {
    const matchesDate = (() => {
      if (!dateFrom && !dateTo) return true
      const d = o.order_date?.slice(0, 10)
      if (!d) return true
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })()
    if (!matchesDate) return false
    if (productFilter) {
      const ms = shipmentMovements[o.id] ?? []
      if (!ms.some((m) => m.inventory_item_id === productFilter)) return false
    }
    return true
  })

  // ── CSV exports — each tab downloads exactly the rows the customer sees ──────
  const slug = fileSlug(company?.name)
  const today = new Date().toISOString().slice(0, 10)
  const periodTag = (dateFrom || dateTo) ? `_${dateFrom || 'start'}_to_${dateTo || today}` : ''

  const inventoryCsvColumns = [
    { header: 'Product', value: (r) => r.product_name },
    { header: 'Variant', value: (r) => r.variant },
    { header: 'SKU', value: (r) => r.sku },
    { header: 'On hand', value: (r) => r.on_hand_qty },
    { header: 'Reserved', value: (r) => r.reserved_qty },
    { header: 'Available', value: (r) => r.available_qty },
    { header: 'Incoming', value: (r) => r.incoming_qty },
    { header: 'Location', value: (r) => r.warehouse_location },
  ]

  const orderExportRows = filteredOrders.map((o) => {
    const addr = o.shipping_address_id ? addressesById[o.shipping_address_id] : null
    const ms = shipmentMovements[o.id] ?? []
    return {
      order_number: o.order_number,
      order_type: o.order_type,
      status: o.status,
      destination: addr ? (addr.label || [addr.city, addr.country].filter(Boolean).join(', ')) : '',
      items: ms.length,
      units: ms.reduce((s, m) => s + Math.abs(m.quantity || 0), 0),
      order_date: o.order_date,
      eta: o.eta,
      carrier: o.carrier_name,
      tracking: o.tracking_number || o.tracking_url || '',
    }
  })
  const orderCsvColumns = [
    { header: 'Order #', value: (r) => r.order_number },
    { header: 'Type', value: (r) => r.order_type },
    { header: 'Status', value: (r) => r.status },
    { header: 'Destination', value: (r) => r.destination },
    { header: 'Items', value: (r) => r.items },
    { header: 'Units', value: (r) => r.units },
    { header: 'Order date', value: (r) => csvDate(r.order_date) },
    { header: 'ETA', value: (r) => csvDate(r.eta) },
    { header: 'Carrier', value: (r) => r.carrier },
    { header: 'Tracking', value: (r) => r.tracking },
  ]

  const movementExportRows = filteredMovements.map((m) => {
    const order = m.warehouse_order_id ? orders.find((o) => o.id === m.warehouse_order_id) : null
    const addr = order?.shipping_address_id ? addressesById[order.shipping_address_id] : null
    return {
      movement_date: m.movement_date,
      product: invById[m.inventory_item_id]?.product_name || '',
      type: m.movement_type,
      reserved: m.is_reserved ? 'yes' : '',
      reservation_label: m.reservation_label || '',
      order_number: order?.order_number || '',
      destination: addr ? (addr.label || [addr.city, addr.country].filter(Boolean).join(', ')) : '',
      actor: m.actor_display_name || '',
      actor_role: m.actor_role || '',
      quantity: (m.movement_type === 'inbound' ? 1 : -1) * (m.quantity || 0),
      notes: m.notes || '',
    }
  })
  const movementCsvColumns = [
    { header: 'Date', value: (r) => csvDate(r.movement_date) },
    { header: 'Item', value: (r) => r.product },
    { header: 'Type', value: (r) => r.type },
    { header: 'Reserved', value: (r) => r.reserved },
    { header: 'Reservation', value: (r) => r.reservation_label },
    { header: 'Order #', value: (r) => r.order_number },
    { header: 'Destination', value: (r) => r.destination },
    { header: 'By', value: (r) => r.actor },
    { header: 'By role', value: (r) => r.actor_role },
    { header: 'Quantity', value: (r) => r.quantity },
    { header: 'Notes', value: (r) => r.notes },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse"
        subtitle="Your stock, shipments and requests."
        action={
          <div className="flex items-center gap-2">
            {canRestock && inventory.length > 0 && (
              <SecondaryButton onClick={() => openRestock([...outOfStock, ...runningLow])}>
                <RefreshCw size={14} />Restock
              </SecondaryButton>
            )}
            <PrimaryButton onClick={() => setWizardOpen(true)}>
              <Plus size={16} />Request shipment
            </PrimaryButton>
          </div>
        }
      />

      {(runningLow.length > 0 || outOfStock.length > 0) && (
        <div className="space-y-2">
          {runningLow.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-900">
                  {runningLow.length} {runningLow.length === 1 ? 'item' : 'items'} running low
                </div>
                <div className="text-xs text-amber-700 mt-0.5 truncate">
                  {runningLow.slice(0, 3).map((i) => i.product_name).join(', ')}{runningLow.length > 3 ? ` and ${runningLow.length - 3} more` : ''}
                </div>
              </div>
              {canRestock && (
                <button
                  type="button"
                  onClick={() => openRestock(runningLow)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700"
                >
                  <RefreshCw size={12} />Restock
                </button>
              )}
            </div>
          )}
          {outOfStock.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <XCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-red-900">
                  {outOfStock.length} {outOfStock.length === 1 ? 'item' : 'items'} out of stock
                </div>
                <div className="text-xs text-red-700 mt-0.5 truncate">
                  {outOfStock.slice(0, 3).map((i) => i.product_name).join(', ')}{outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : ''}
                </div>
              </div>
              {canRestock && (
                <button
                  type="button"
                  onClick={() => openRestock(outOfStock)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                >
                  <RefreshCw size={12} />Restock
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { id: 'inventory', label: `Inventory (${inventory.length})` },
          { id: 'requests', label: `My requests${pendingRequests > 0 ? ` · ${pendingRequests}` : ''} (${requests.length})` },
          { id: 'orders', label: `Shipments (${orders.length})` },
          { id: 'spend', label: 'Shipping costs' },
          { id: 'movements', label: `Movements (${movements.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inventory' && (
        inventory.length === 0 ? (
          <EmptyState icon={Package} title="No inventory" description="Stock will appear here once items are received." />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Current stock — {inventory.length} item{inventory.length === 1 ? '' : 's'}</span>
              <ExportCsvButton filename={`${slug}-inventory-${today}.csv`} columns={inventoryCsvColumns} rows={inventory} />
            </div>
            {[
              { id: 'out', label: 'Out of stock', icon: XCircle, iconClass: 'text-red-500', items: outOfStock },
              { id: 'low', label: 'Running low', icon: AlertTriangle, iconClass: 'text-amber-500', items: runningLow },
              { id: 'ok', label: 'In stock', icon: CheckCircle2, iconClass: 'text-green-500', items: inStock },
            ].filter((s) => s.items.length > 0).map((s) => (
              <div key={s.id}>
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 mb-4">
                  <s.icon size={14} className={s.iconClass} />
                  <span className="text-sm font-semibold text-gray-900">{s.label}</span>
                  <span className="text-xs text-gray-400">({s.items.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {s.items.map((i) => (
                    <InventoryCard
                      key={i.id}
                      item={i}
                      incomingEta={incomingEtaByInv[i.id]}
                      onClick={() => setSelectedInv(i)}
                      onRestock={canRestock ? (item) => openRestock([item]) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'requests' && (
        requests.length === 0 ? (
          <EmptyState
            icon={TruckIcon}
            title="No shipment requests yet"
            description="Request a shipment from your stock — we'll reserve the items and handle fulfilment."
            action={<PrimaryButton onClick={() => setWizardOpen(true)}><Plus size={16} />Request shipment</PrimaryButton>}
          />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                items={requestItems[r.id]}
                onClick={() => setSelectedRequest({ request: r, items: requestItems[r.id] })}
              />
            ))}
          </div>
        )
      )}

      {tab === 'orders' && (
        <>
          <FiltersBar
            products={inventory}
            productId={productFilter}
            onProductChange={setProductFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
            extra={<ExportCsvButton filename={`${slug}-shipments-${today}${periodTag}.csv`} columns={orderCsvColumns} rows={orderExportRows} />}
          />
          {filteredOrders.length === 0 ? (
            <EmptyState icon={TruckIcon} title={orders.length === 0 ? 'No shipments' : 'Nothing matches your filters'} description={orders.length === 0 ? 'Confirmed shipments will appear here once processed.' : 'Adjust filters to see more.'} />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Destination</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Items</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ETA</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tracking</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const addr = o.shipping_address_id ? addressesById[o.shipping_address_id] : null
                    const ms = shipmentMovements[o.id] ?? []
                    const itemCount = ms.length
                    const totalQty = ms.reduce((s, m) => s + Math.abs(m.quantity || 0), 0)
                    return (
                      <tr key={o.id} onClick={() => setSelectedShipment({ order: o, address: addr, items: ms })} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-blue-50/30">
                        <td className="px-5 py-3 text-gray-500">#{o.order_number}</td>
                        <td className="px-5 py-3 text-gray-900">{o.order_type}</td>
                        <td className="px-5 py-3 text-gray-700 text-xs truncate max-w-[200px]">
                          {addr ? (addr.label || [addr.city, addr.country].filter(Boolean).join(', ')) : '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-700">
                          {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'} · ${totalQty} unit${totalQty === 1 ? '' : 's'}` : '—'}
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{formatDate(o.eta) || '—'}</td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          {o.tracking_url ? (
                            <a
                              href={o.tracking_url.startsWith('http') ? o.tracking_url : `https://${o.tracking_url}`}
                              target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                            >
                              <ExternalLink size={12} />Track
                            </a>
                          ) : (
                            <span className="text-gray-400 text-sm">{o.tracking_number || '—'}</span>
                          )}
                        </td>
                        <td className="pr-4 text-gray-400"><ArrowRight size={14} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'spend' && (
        <SpendTab
          requests={requests}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
          filename={`${slug}-shipping-costs-${today}${periodTag}.csv`}
        />
      )}

      {tab === 'movements' && (
        <>
          <FiltersBar
            products={inventory}
            productId={productFilter}
            onProductChange={setProductFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
            extra={<ExportCsvButton filename={`${slug}-movements-${today}${periodTag}.csv`} columns={movementCsvColumns} rows={movementExportRows} />}
          />
          {filteredMovements.length === 0 ? (
            <EmptyState icon={Activity} title={movements.length === 0 ? 'No movements' : 'Nothing matches your filters'} description={movements.length === 0 ? 'Stock movements will appear here.' : 'Adjust filters to see more.'} />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Destination / Order</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">By</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m) => {
                    const order = m.warehouse_order_id ? orders.find((o) => o.id === m.warehouse_order_id) : null
                    const addr = order?.shipping_address_id ? addressesById[order.shipping_address_id] : null
                    return (
                      <tr key={m.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(m.movement_date)}</td>
                        <td className="px-5 py-3 text-gray-900">{invById[m.inventory_item_id]?.product_name || '—'}</td>
                        <td className="px-5 py-3 text-gray-700 capitalize">
                          {m.movement_type?.replace(/_/g, ' ')}
                          {m.is_reserved && <span className="text-xs text-amber-600 ml-1">(reserved)</span>}
                          {m.reservation_label && <span className="text-xs text-gray-400 ml-1">· {m.reservation_label}</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-600">
                          {order ? (
                            <button
                              onClick={() => setSelectedShipment({ order, address: addr, items: shipmentMovements[order.id] ?? [] })}
                              className="text-left hover:text-blue-600"
                            >
                              <div>#{order.order_number}</div>
                              {addr && <div className="text-gray-500">{addr.label || [addr.city, addr.country].filter(Boolean).join(', ')}</div>}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {m.actor_display_name ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-gray-700 truncate max-w-[140px]">{m.actor_display_name}</span>
                              {m.actor_role && (
                                <span className={`inline-flex items-center text-[9px] uppercase font-medium px-1 py-0.5 rounded-full ring-1 ring-inset ${
                                  m.actor_role === 'team' ? 'text-purple-700 bg-purple-50 ring-purple-200' :
                                  m.actor_role === 'customer' ? 'text-blue-700 bg-blue-50 ring-blue-200' :
                                  'text-gray-600 bg-gray-50 ring-gray-200'
                                }`}>{m.actor_role}</span>
                              )}
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className={`px-5 py-3 text-right font-medium ${m.movement_type === 'inbound' ? 'text-green-700' : 'text-red-600'}`}>
                          {m.movement_type === 'inbound' ? '+' : '-'}{m.quantity}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selectedInv && (
        <InventoryDetail
          item={selectedInv}
          ordersById={Object.fromEntries(orders.map((o) => [o.id, o]))}
          addressesById={addressesById}
          requestByOrderId={requestByOrderId}
          onClose={() => setSelectedInv(null)}
          onRestock={canRestock ? (item) => { setSelectedInv(null); openRestock([item]) } : undefined}
        />
      )}
      {selectedRequest && (
        <RequestDetail
          request={selectedRequest.request}
          items={selectedRequest.items}
          onClose={() => setSelectedRequest(null)}
        />
      )}
      {selectedShipment && (
        <ShipmentDetail
          order={selectedShipment.order}
          address={selectedShipment.address}
          items={selectedShipment.items}
          inventoryById={invById}
          onClose={() => setSelectedShipment(null)}
        />
      )}
      {wizardOpen && (
        <RequestShipmentWizard
          company={company}
          contact={contact}
          onClose={() => setWizardOpen(false)}
          onCreated={() => { setTab('requests'); setRefresh((r) => r + 1) }}
        />
      )}
      {restockFor && (
        <RestockModal
          company={company}
          inventory={inventory}
          preselectedInvIds={restockFor}
          onClose={() => setRestockFor(null)}
          onStart={(items, formPatch) => {
            setRestockFor(null)
            onStartProposalWithItems?.(items, formPatch)
          }}
        />
      )}
    </div>
  )
}

// --- Request detail drawer (full view) ---
// --- Shipping-cost history ---
function SpendTab({ requests, dateFrom = '', dateTo = '', onDateChange, filename = 'shipping-costs.csv' }) {
  // Only requests that carry a quoted price (i.e. went through the calculator)
  const priced = (requests || []).filter((r) => r.quoted_price_cents != null && r.created_at)

  const now = new Date()
  const startOfThisYear = new Date(now.getFullYear(), 0, 1)
  const startOfLast30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const inWindow = (r, from, to) => {
    const d = new Date(r.created_at)
    return d >= from && (!to || d < to)
  }
  const sum = (rows) => rows.reduce((s, r) => s + (r.quoted_price_cents || 0), 0)

  const thisYear = priced.filter((r) => inWindow(r, startOfThisYear))
  const last30 = priced.filter((r) => inWindow(r, startOfLast30))
  const thisMonth = priced.filter((r) => inWindow(r, startOfThisMonth))

  // The chosen period scopes the detailed list + monthly breakdown + export.
  // The top tiles stay as their own labelled windows (this month / 30d / YTD).
  const rangeRows = priced.filter((r) => {
    const d = String(r.created_at).slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  })

  const spendCsvColumns = [
    { header: 'Date', value: (r) => csvDate(r.created_at) },
    { header: 'Recipient', value: (r) => r.ship_to_name || '' },
    { header: 'City', value: (r) => r.ship_to_city || '' },
    { header: 'Country', value: (r) => r.ship_to_country || '' },
    { header: 'Carrier', value: (r) => r.quoted_carrier_name || '' },
    { header: 'Service', value: (r) => r.quoted_service_label || '' },
    { header: 'Speed', value: (r) => r.quoted_speed || '' },
    { header: 'Price (EUR)', value: (r) => csvEur(r.quoted_price_cents) },
    { header: 'VAT', value: (r) => (r.quoted_price_includes_vat ? 'incl' : 'excl') },
    { header: 'Status', value: (r) => r.status || '' },
  ]

  // Group by year-month (within the chosen period)
  const byMonth = {}
  for (const r of rangeRows) {
    const d = new Date(r.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(r)
  }
  const months = Object.keys(byMonth).sort().reverse()
  const monthMax = Math.max(1, ...months.map((m) => sum(byMonth[m])))

  if (priced.length === 0) {
    return (
      <EmptyState
        icon={TruckIcon}
        title="No priced shipments yet"
        description="Once you request a shipment with the live price calculator, the cost history will appear here."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Period + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Filter size={12} />Period:</span>
          <input type="date" value={dateFrom} onChange={(e) => onDateChange?.({ from: e.target.value, to: dateTo })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={dateTo} onChange={(e) => onDateChange?.({ from: dateFrom, to: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {(dateFrom || dateTo) && <button onClick={() => onDateChange?.({ from: '', to: '' })} className="text-xs text-gray-500 hover:text-gray-700 ml-1">Clear</button>}
        </div>
        <ExportCsvButton filename={filename} columns={spendCsvColumns} rows={rangeRows} />
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="This month" value={formatCents(sum(thisMonth))} sub={`${thisMonth.length} shipment${thisMonth.length === 1 ? '' : 's'}`} tone="blue" />
        <StatTile label="Last 30 days" value={formatCents(sum(last30))} sub={`${last30.length} shipment${last30.length === 1 ? '' : 's'}`} tone="indigo" />
        <StatTile label={`Year-to-date · ${now.getFullYear()}`} value={formatCents(sum(thisYear))} sub={`${thisYear.length} shipment${thisYear.length === 1 ? '' : 's'} · avg ${formatCents(thisYear.length ? sum(thisYear) / thisYear.length : 0)}`} tone="green" />
      </div>

      {/* Monthly bar list */}
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide">Spend by month</div>
        <div className="divide-y divide-gray-100">
          {months.map((m) => {
            const total = sum(byMonth[m])
            const pct = Math.max(2, Math.round((total / monthMax) * 100))
            const [y, mm] = m.split('-')
            const label = new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
            return (
              <div key={m} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="w-20 text-xs font-medium text-gray-600">{label}</div>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-28 text-right text-xs">
                  <div className="font-semibold text-gray-900">{formatCents(total)}</div>
                  <div className="text-[10px] text-gray-500">{byMonth[m].length} shipment{byMonth[m].length === 1 ? '' : 's'}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Full priced-request list */}
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide">All priced shipments{(dateFrom || dateTo) ? ` · ${rangeRows.length} in period` : ''}</div>
        <div className="divide-y divide-gray-100">
          {rangeRows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start gap-3 text-sm">
              <div className="text-xs text-gray-400 w-20 flex-shrink-0">{formatDate(r.created_at)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{r.ship_to_name || r.ship_to_city || 'Shipment'}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {[r.ship_to_city, r.ship_to_country].filter(Boolean).join(' · ')}
                  {r.quoted_carrier_name && <> · {r.quoted_carrier_name}</>}
                  {r.quoted_speed && <> · {r.quoted_speed}</>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold text-gray-900">{formatCents(r.quoted_price_cents)}</div>
                <div className="text-[10px] text-gray-500">{r.quoted_price_includes_vat ? 'incl. VAT' : 'excl. VAT'}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value, sub, tone = 'gray' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    gray: 'border-gray-200 bg-white text-gray-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.gray}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
    </div>
  )
}

function RequestDetail({ request, items, onClose }) {
  const requester = request.requested_by_contact
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Shipment request</div>
            <h2 className="text-lg font-semibold text-gray-900">{request.ship_to_name || 'Request'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={request.status} />
            {request.shipping_speed && <Badge tone={request.shipping_speed === 'express' ? 'purple' : 'gray'}>{request.shipping_speed}</Badge>}
            {request.ship_asap && <Badge tone="blue"><Zap size={10} className="mr-0.5" />ASAP</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-500">Ship-out date</div><div className="text-gray-900 font-medium">{request.ship_asap ? 'ASAP' : formatDate(request.requested_date) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Created</div><div className="text-gray-900">{formatDate(request.created_at)}</div></div>
            <div><div className="text-xs text-gray-500">Requested by</div><div className="text-gray-900">{requester ? `${requester.first_name} ${requester.last_name}` : '—'}</div></div>
            <div><div className="text-xs text-gray-500">Handled at</div><div className="text-gray-900">{formatDate(request.handled_at) || '—'}</div></div>
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1"><MapPin size={12} />Shipping to</div>
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="text-sm font-medium text-gray-900">{request.ship_to_name || '—'}</div>
              <div className="text-xs text-gray-600 mt-0.5">
                {[request.ship_to_address, request.ship_to_postcode, request.ship_to_city, request.ship_to_country].filter(Boolean).join(', ')}
              </div>
              {request.ship_to_contact_name && (
                <div className="text-[11px] text-gray-600 mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1"><User size={10} />{request.ship_to_contact_name}</span>
                  {request.ship_to_contact_phone && <a href={`tel:${request.ship_to_contact_phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone size={10} />{request.ship_to_contact_phone}</a>}
                  {request.ship_to_contact_email && <a href={`mailto:${request.ship_to_contact_email}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Mail size={10} />{request.ship_to_contact_email}</a>}
                </div>
              )}
            </div>
          </div>

          {items?.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Items ({items.reduce((s, i) => s + i.qty, 0)} units)</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">
                          {i.warehouse_inventory?.product_name || i.inventory_id}
                          {i.warehouse_inventory?.variant && <span className="text-xs text-gray-500 ml-1">· {i.warehouse_inventory.variant}</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{i.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {request.notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Notes</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{request.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
