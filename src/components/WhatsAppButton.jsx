import { MessageCircle } from 'lucide-react'

export default function WhatsAppButton({ url }) {
  if (!url) return null
  const href = url.startsWith('http') ? url : `https://${url}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Open team WhatsApp group"
      className="fixed bottom-3 sm:bottom-5 right-3 sm:right-5 z-40 inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-[#25D366] hover:bg-[#1ebe57] text-white shadow-lg shadow-green-500/20 transition-colors text-sm font-medium"
    >
      <MessageCircle size={16} />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  )
}
