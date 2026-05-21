import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, FileText, Receipt, Palette, FolderKanban,
  Warehouse, BookOpen, Store, Users, Settings as SettingsIcon, LogOut, Plus, Sparkles, FileSpreadsheet
} from 'lucide-react'
import DashboardPage from '../pages/DashboardPage'
import SettingsPage from '../pages/SettingsPage'
import ProposalsPage from '../pages/ProposalsPage'
import QuotesPage from '../pages/QuotesPage'
import DesignsPage from '../pages/DesignsPage'
import ProjectsPage from '../pages/ProjectsPage'
import InvoicesPage from '../pages/InvoicesPage'
import WarehousePage from '../pages/WarehousePage'
import CataloguePage from '../pages/CataloguePage'
import ContactsPage from '../pages/ContactsPage'
import BrandshopPage from '../pages/BrandshopPage'
import BrandPage from '../pages/BrandPage'
import StartProposalWizard from './StartProposalWizard'
import WhatsAppButton from './WhatsAppButton'
import ProposalDraftWidget from './ProposalDraftWidget'
import { readProposalDraft, clearProposalDraft } from '../lib/proposalDraft'

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'proposals', label: 'Proposals', icon: FileText },
  { id: 'quotes', label: 'Quotes', icon: Receipt },
  { id: 'designs', label: 'Designs', icon: Palette },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'invoices', label: 'Invoices', icon: FileSpreadsheet },
  { id: 'brand', label: 'Brand', icon: Sparkles },
  { id: 'brandshop', label: 'Brandshop', icon: Store, requiresBrandshop: true },
  { id: 'warehouse', label: 'Warehouse', icon: Warehouse },
  { id: 'catalogue', label: 'Catalogue', icon: BookOpen },
  { id: 'contacts', label: 'Team', icon: Users },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function Layout({ session, contact, company }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardPrefill, setWizardPrefill] = useState(null) // optional pre-loaded item
  const [wizardResume, setWizardResume] = useState(null)   // draft snapshot to resume from
  const [draft, setDraft] = useState(null)                 // in-progress proposal draft
  const [refreshKey, setRefreshKey] = useState(0)
  const [deepLink, setDeepLink] = useState(null) // { tab, id, review }

  // Read any saved draft on mount / when company changes
  useEffect(() => {
    if (!company?.id) return
    setDraft(readProposalDraft(company.id))
  }, [company?.id])

  // Poll while wizard is open: when it saves, we want to refresh the widget when it closes
  useEffect(() => {
    if (wizardOpen || !company?.id) return
    setDraft(readProposalDraft(company.id))
  }, [wizardOpen, company?.id, refreshKey])

  // Read deep-link params from URL on first load: ?tab=projects&id=<uuid>&review=<token>
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      const id = params.get('id')
      const review = params.get('review')
      if (tab) {
        const known = tabs.find((t) => t.id === tab)
        if (known) setActiveTab(tab)
      }
      if (tab && (id || review)) setDeepLink({ tab, id, review })
      // Clean URL so refresh doesn't re-trigger
      if (tab || id || review) {
        const url = new URL(window.location.href)
        url.search = ''
        window.history.replaceState({}, '', url.toString())
      }
    } catch { /* ignore */ }
  }, [])

  const visibleTabs = tabs.filter((t) => !t.requiresBrandshop || company?.brandshop_addon)

  const openWizard = () => { setWizardPrefill(null); setWizardResume(null); setWizardOpen(true) }
  const openWizardWithItem = (prefilled) => { setWizardPrefill(prefilled); setWizardResume(null); setWizardOpen(true) }
  const resumeWizardFromDraft = () => { setWizardPrefill(null); setWizardResume(draft); setWizardOpen(true) }
  const discardDraft = () => { clearProposalDraft(company?.id); setDraft(null) }

  const navigateTo = (tab, id) => {
    setDeepLink(id ? { tab, id } : null)
    setActiveTab(tab)
  }
  const clearDeepLink = () => setDeepLink(null)
  const linkId = (tab) => (deepLink?.tab === tab ? deepLink.id : null)

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage key={refreshKey} session={session} contact={contact} company={company} navigate={setActiveTab} />
      case 'proposals': return <ProposalsPage key={refreshKey} company={company} contact={contact} onStartProposal={openWizard} onOpenProject={(id) => navigateTo('projects', id)} />
      case 'quotes': return <QuotesPage key={refreshKey} company={company} contact={contact} deepLinkId={linkId('quotes')} clearDeepLink={clearDeepLink} />
      case 'designs': return <DesignsPage key={refreshKey} company={company} contact={contact} deepLinkId={linkId('designs')} clearDeepLink={clearDeepLink} />
      case 'projects': return <ProjectsPage company={company} contact={contact} deepLinkId={linkId('projects')} deepLinkReview={deepLink?.tab === 'projects' ? deepLink?.review : null} clearDeepLink={clearDeepLink} />
      case 'invoices': return <InvoicesPage company={company} contact={contact} />
      case 'brand': return <BrandPage company={company} contact={contact} />
      case 'brandshop': return <BrandshopPage company={company} contact={contact} />
      case 'warehouse': return <WarehousePage company={company} contact={contact} />
      case 'catalogue': return <CataloguePage company={company} contact={contact} onStartProposalWithItem={openWizardWithItem} />
      case 'contacts': return <ContactsPage company={company} contact={contact} />
      case 'settings': return <SettingsPage company={company} contact={contact} />
      default: return null
    }
  }

  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || session.user.email

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Custom95</h1>
          <p className="text-xs text-gray-400 mt-0.5">{company?.name || 'Customer Portal'}</p>
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={openWizard}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />Start proposal
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">
              {contactName?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{contactName}</p>
              <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-gray-400 hover:text-gray-600"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-56">
        <div className="p-6 max-w-7xl">
          {renderContent()}
        </div>
      </main>

      <WhatsAppButton url={company?.whatsapp_group_url} />

      {/* In-progress proposal pill (hidden while the wizard itself is open) */}
      {!wizardOpen && draft && (
        <ProposalDraftWidget
          draft={draft}
          company={company}
          onResume={resumeWizardFromDraft}
          onDiscard={discardDraft}
        />
      )}

      {wizardOpen && (
        <StartProposalWizard
          company={company}
          contact={contact}
          prefillItem={wizardPrefill}
          resumeDraft={wizardResume}
          onClose={() => {
            setWizardOpen(false)
            setWizardPrefill(null)
            setWizardResume(null)
            // The wizard saves on every change, so re-read whatever it left behind
            if (company?.id) setDraft(readProposalDraft(company.id))
          }}
          onCreated={() => {
            setRefreshKey((k) => k + 1)
            setActiveTab('proposals')
            setWizardPrefill(null)
            setWizardResume(null)
            setDraft(null)
          }}
        />
      )}
    </div>
  )
}
