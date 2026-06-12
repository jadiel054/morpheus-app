import { X } from 'lucide-react'

export function ConversationTabs({ tabs, activeTabId, onSelect, onClose, onCreate }) {
  return (
    <div className="conversation-tabs">
      {tabs.map(tab => (
        <div key={tab.id} className={`conversation-tab ${tab.id === activeTabId ? 'conversation-tab--active' : ''}`} onClick={() => onSelect(tab.id)}>
          <span>{tab.title}</span>
          {tabs.length > 1 && <button className="conversation-tab-close" onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}><X size={10} /></button>}
        </div>
      ))}
      <button onClick={onCreate} className="conversation-tab opacity-50 hover:opacity-100">+ Nova</button>
    </div>
  )
}
