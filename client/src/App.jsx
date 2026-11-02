import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Bell, Check, CheckCheck, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, Compass, FilePlus2, Filter, Heart, LayoutDashboard, LogOut,
  MapPin, Menu, PackageCheck, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, X,
} from 'lucide-react'
import api, { getErrorMessage } from './api'

const AuthContext = createContext(null)
const categories = ['Electronics', 'Books and Stationery', 'Identity Cards', 'Clothing and Accessories', 'Keys', 'Sports Equipment', 'Bags and Wallets', 'Other']
const roleHome = { student: '/dashboard', admin: '/admin', helpdesk: '/helpdesk' }
const AdminChart = lazy(() => import('./AdminChart.jsx'))
const INITIAL_DATE = new Date()

function updateSearchParam(setParams, key, value) {
  setParams((current) => {
    const next = new URLSearchParams(current)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    return next
  })
}

function signalNotificationUpdate() {
  window.dispatchEvent(new Event('unifind:notifications-updated'))
}

function imageUploadError(form, fieldName) {
  const file = form.get(fieldName)
  if (!file?.name) return ''
  if (file.size > 5 * 1024 * 1024) return 'Images must be 5 MB or smaller.'
  const extensions = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }
  const extension = `.${file.name.split('.').pop().toLowerCase()}`
  if (!extensions[file.type]?.includes(extension)) return 'Upload a JPG, PNG, or WebP image.'
  return ''
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(() => !localStorage.getItem('unifind-token'))
  const [authError, setAuthError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    const token = localStorage.getItem('unifind-token')
    if (!token) return
    let active = true
    api.get('/auth/me')
      .then(({ data }) => { if (active) { setUser(data.user); setAuthError('') } })
      .catch((error) => {
        if (!active) return
        if (error.response?.status === 401) {
          localStorage.removeItem('unifind-token')
          setUser(null)
          setAuthError('')
        } else {
          setAuthError(getErrorMessage(error))
        }
      })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [retryCount])
  const value = useMemo(() => ({
    user,
    ready,
    authError,
    retrySession: () => { setReady(false); setRetryCount((count) => count + 1) },
    signIn: (data) => { localStorage.setItem('unifind-token', data.token); setUser(data.user); setAuthError(''); setReady(true) },
    updateUser: setUser,
    signOut: () => { localStorage.removeItem('unifind-token'); setUser(null); setAuthError(''); setReady(true) },
  }), [user, ready, authError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() { return useContext(AuthContext) }

function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/browse" element={<Marketplace />} />
    <Route path="/items/:id" element={<ItemDetails />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/register" element={<AuthPage register />} />
    <Route path="/dashboard" element={<Protected roles={['student']}><Dashboard /></Protected>} />
    <Route path="/report/:type" element={<Protected roles={['student']}><ReportPage /></Protected>} />
    <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
    <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
    <Route path="/admin" element={<Protected roles={['admin']}><AdminPage /></Protected>} />
    <Route path="/helpdesk" element={<Protected roles={['helpdesk']}><HelpDeskPage /></Protected>} />
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter></AuthProvider>
}

function Protected({ children, roles }) {
  const { user, ready, authError, retrySession, signOut } = useAuth()
  const location = useLocation()
  if (!ready) return <LoadingPage />
  if (authError) return <SessionUnavailable error={authError} onRetry={retrySession} onSignOut={signOut} />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={roleHome[user.role]} replace />
  return children
}

function Brand({ inverse = false }) {
  return <Link to="/" className={`brand ${inverse ? 'brand-inverse' : ''}`} aria-label="UniFind home">
    <span className="brand-mark"><Compass size={21} strokeWidth={2.2} /></span>
    <span>uni<span>find</span><small> CAMPUS LOST & FOUND</small></span>
  </Link>
}

function Landing() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({ found: null })
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/items?limit=3')
      .then(({ data }) => { setItems(data.items); setStats((current) => ({ ...current, found: data.total })) })
      .catch((cause) => setError(getErrorMessage(cause)))
  }, [])
  function submitSearch(event) {
    event.preventDefault()
    window.location.href = `/browse?search=${encodeURIComponent(search)}`
  }
  return <div className="landing-page">
    <header className="public-nav">
      <Brand />
      <nav className="nav-links"><Link to="/browse">Browse items</Link><a href="#how">How it works</a><a href="#stories">Campus impact</a></nav>
      <div className="nav-actions">{user ? <Link className="button button-outline" to={roleHome[user.role]}>My workspace <ArrowRight size={16} /></Link> : <><Link className="nav-signin" to="/login">Sign in</Link><Link className="button button-dark" to="/register">Join UniFind <ArrowRight size={16} /></Link></>}</div>
    </header>

    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A little kindness goes a long way</div>
          <h1>Lost something?<br /><em>Let’s find it.</em></h1>
          <p>Your campus community is better at looking out for each other. Find a missing essential or help someone reconnect with theirs.</p>
          <form className="hero-search" onSubmit={submitSearch}>
            <Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try “black headphones” or “library”" aria-label="Search lost and found items" />
            <button type="submit" aria-label="Search"><ArrowRight size={18} /></button>
          </form>
          <div className="hero-ctas"><Link to="/report/lost" className="button button-terracotta"><Plus size={17} /> I lost something</Link><Link to="/report/found" className="button button-outline"><Heart size={15} /> I found something</Link></div>
          <Link className="text-link hero-explore-link" to="/browse">Explore listings <ArrowRight size={16} /></Link>
          <div className="campus-note"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div><span><strong>Good things happen here.</strong><br />Campus members looking out for one another</span></div>
        </div>
        <div className="hero-art">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-image-frame">
            <div className="photo-sun" /><div className="photo-window"><span /><span /><span /></div>
            <div className="photo-shelf"><div className="book-book book-one" /><div className="book-book book-two" /><div className="plant"><i /><i /><i /><b /></div></div>
            <div className="photo-table"><div className="headphone"><i /><b /><b /></div><div className="notebook"><span /></div></div>
            <div className="photo-leg leg-left" /><div className="photo-leg leg-right" />
          </div>
          <div className="floating-note note-found"><span className="note-icon"><Heart size={16} fill="currentColor" /></span><span><strong>Kindness spotted</strong><small>One more item, home again</small></span><Check size={17} /></div>
          <div className="floating-note note-pin"><MapPin size={16} /><span>North campus library</span></div>
          <div className="hero-sticker"><Sparkles size={16} /><span>Small finds,<br />big relief.</span></div>
        </div>
        <div className="hero-bottom-label"><span>01 — 03</span><span>YOUR CAMPUS, CONNECTED</span><span className="scroll-line" /></div>
      </section>

      <section className="impact-strip" id="stories">
        <div><span className="impact-icon"><PackageCheck size={21} /></span><p>        <strong>{stats.found ?? '—'}</strong><small>approved listings</small></p></div>
        <span className="impact-divider" />
        <div><span className="impact-icon amber"><Heart size={21} /></span><p><strong>One campus</strong><small>looking out for each other</small></p></div>
        <span className="impact-divider" />
        <div className="impact-quote">“A lost thing is never just a thing.” <span>— UniFind community</span></div>
      </section>

      <section className="section recent-section">
        <div className="section-heading"><div><div className="eyebrow">THE LATEST FINDS</div><h2>A few things looking<br />for their people.</h2></div><Link to="/browse" className="button button-outline">View all listings <ArrowRight size={16} /></Link></div>
        {error ? <p className="inline-error">{error}</p> : items.length ? <div className="item-grid">{items.map((item) => <ItemCard key={item._id} item={item} />)}</div> : <EmptyState title="A fresh start." description="No approved listings just yet. Check back soon or be the first to report an item." action={<Link className="text-link" to="/register">Join the community <ArrowRight size={15} /></Link>} />}
      </section>

      <section className="how-section" id="how">
        <div className="how-left"><div className="eyebrow">GOOD THINGS, MADE SIMPLE</div><h2>Three steps.<br /><em>One less worry.</em></h2><p>No awkward group chats. No lost-and-found drawer of mystery. Just a thoughtful little system to bring things back together.</p><Link className="button button-dark" to="/register">Get started <ArrowRight size={16} /></Link></div>
        <div className="steps-list">
          <Step number="01" title="Tell us what’s missing" text="Add a few details so your campus community knows what to keep an eye out for." icon={<FilePlus2 />} />
          <Step number="02" title="A good match turns up" text="Browse approved reports or get a note when there’s an update on yours." icon={<Search />} />
          <Step number="03" title="Make it yours again" text="Our campus help desk verifies handover, so your item comes home safely." icon={<PackageCheck />} />
        </div>
      </section>

      <footer className="public-footer"><Brand inverse /><p>A little more found. A little less lost.</p><span>Made for campus, with care. © {INITIAL_DATE.getFullYear()} UniFind</span></footer>
    </main>
  </div>
}

function Step({ number, title, text, icon }) {
  return <div className="step-row"><span className="step-number">{number}</span><div className="step-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div><ChevronRight size={19} className="step-chevron" /></div>
}

function ItemCard({ item }) {
  return <Link to={`/items/${item._id}`} className="item-card">
    <div className={`item-card-image ${!item.image ? `illustration illustration-${(item.itemName.length % 4) + 1}` : ''}`}>
      {item.image ? <img src={item.image} alt={item.itemName} /> : <ItemIllustration item={item} />}
      <span className={`type-badge ${item.itemType.toLowerCase()}`}>{item.itemType === 'Found' ? <Heart size={13} /> : <Search size={13} />}{item.itemType}</span>
      {item.itemStatus !== 'Active' && <StatusBadge>{item.itemStatus}</StatusBadge>}
    </div>
    <div className="item-card-body"><div className="item-category">{item.category}</div><h3>{item.itemName}</h3><div className="item-card-meta"><span><MapPin size={14} />{item.location}</span><span>{formatDate(item.dateOfIncident)}</span></div></div>
  </Link>
}

function ItemIllustration({ item }) {
  const symbols = { Electronics: '◉', 'Books and Stationery': '▤', 'Identity Cards': '▭', 'Clothing and Accessories': '◇', Keys: '⚿', 'Sports Equipment': '◌', 'Bags and Wallets': '▱', Other: '✳' }
  return <div className="illustration-object"><span>{symbols[item.category] || '✳'}</span><small>{item.category}</small></div>
}

function Marketplace() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [result, setResult] = useState({ key: null, retry: -1, items: [], pages: 1, total: 0, error: '' })
  const search = params.get('search') || ''
  const location = params.get('location') || ''
  const paramKey = params.toString()
  const [searchDraft, setSearchDraft] = useState(search)
  const [locationDraft, setLocationDraft] = useState(location)
  const [retry, setRetry] = useState(0)
  const hasCurrentResult = result.key === paramKey && result.retry === retry
  const loading = !hasCurrentResult
  const items = hasCurrentResult ? result.items : []
  const pages = hasCurrentResult ? result.pages : 1
  const total = hasCurrentResult ? result.total : 0
  const error = hasCurrentResult ? result.error : ''
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    api.get(`/items?${paramKey}`, { signal: controller.signal })
      .then(({ data }) => {
        if (active) setResult({ key: paramKey, retry, items: data.items, pages: data.pages, total: data.total, error: '' })
      })
      .catch((cause) => { if (active) setResult({ key: paramKey, retry, items: [], pages: 1, total: 0, error: getErrorMessage(cause) }) })
    return () => { active = false; controller.abort() }
  }, [paramKey, retry])
  useEffect(() => { setSearchDraft(search); setLocationDraft(location) }, [search, location])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft.trim() !== search) updateSearchParam(setParams, 'search', searchDraft.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchDraft, search, setParams])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (locationDraft.trim() !== location) updateSearchParam(setParams, 'location', locationDraft.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [locationDraft, location, setParams])
  return <div className="browse-page">
    <PublicHeader />
    <div className="browse-heading"><div className="eyebrow">A COMMUNITY BOARD, WITH A HEART</div><h1>Good things<br /><em>find their way.</em></h1><p>Browse what’s been found around campus, or help us keep an eye out for something missing.</p></div>
    <div className="browse-search"><Search size={18} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search a name, detail or campus spot" aria-label="Search listings" /><Filter size={17} /></div>
    <div className="filters-row">
      <div className="filter-pills">{['', 'Lost', 'Found'].map((type) => <button key={type || 'all'} className={`filter-pill ${params.get('type') === type || (!type && !params.get('type')) ? 'selected' : ''}`} onClick={() => updateSearchParam(setParams, 'type', type)}>{type || 'Everything'}</button>)}</div>
      <select aria-label="Filter by category" value={params.get('category') || ''} onChange={(event) => updateSearchParam(setParams, 'category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <input className="location-filter" aria-label="Filter by location" placeholder="Campus location" value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} />
      <label className="date-filter">From<input aria-label="Reported from" type="date" max={params.get('to') || undefined} value={params.get('from') || ''} onChange={(event) => updateSearchParam(setParams, 'from', event.target.value)} /></label>
      <label className="date-filter">To<input aria-label="Reported through" type="date" min={params.get('from') || undefined} value={params.get('to') || ''} onChange={(event) => updateSearchParam(setParams, 'to', event.target.value)} /></label>
    </div>
    <div className="results-caption"><span>{loading ? 'Looking around…' : `${total} ${total === 1 ? 'listing' : 'listings'} to explore`}</span><span>Recently reported <ChevronDown size={15} /></span></div>
    {error ? <EmptyState title="Couldn’t load listings" description={error} action={<button className="button button-outline" onClick={() => setRetry((value) => value + 1)}>Try again</button>} /> :
      loading ? <LoadingPage compact /> : items.length ? <><div className="item-grid browse-grid">{items.map((item) => <ItemCard key={item._id} item={item} />)}</div><div className="pagination"><button className="button button-outline" disabled={(Number(params.get('page')) || 1) <= 1} onClick={() => updateSearchParam(setParams, 'page', String((Number(params.get('page')) || 1) - 1))}>Previous</button><span>Page {Number(params.get('page')) || 1} of {pages}</span><button className="button button-outline" disabled={(Number(params.get('page')) || 1) >= pages} onClick={() => updateSearchParam(setParams, 'page', String((Number(params.get('page')) || 1) + 1))}>Next</button></div></> :
        <EmptyState title="Nothing here, for now." description="Try another search or filter. New reports appear after a quick review by the campus team." action={<Link to={user?.role === 'student' ? '/report/lost' : user ? roleHome[user.role] : '/register'} state={user ? undefined : { from: { pathname: '/report/lost' } }} className="button button-dark">{user && user.role !== 'student' ? 'Open workspace' : 'Report an item'} <ArrowRight size={15} /></Link>} />}
    <FooterCompact />
  </div>
}

function PublicHeader() {
  const { user } = useAuth()
  return <header className="public-nav browse-nav"><Brand /><nav className="nav-links"><Link to="/browse">Browse items</Link><a href="/#how">How it works</a></nav><div className="nav-actions">{user ? <Link className="button button-outline" to={roleHome[user.role]}>My workspace <ArrowRight size={16} /></Link> : <><Link className="nav-signin" to="/login">Sign in</Link><Link className="button button-dark" to="/register">Join UniFind <ArrowRight size={16} /></Link></>}</div></header>
}

function ItemDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [result, setResult] = useState({ id: null, item: null, error: '' })
  const item = result.id === id ? result.item : null
  const error = result.id === id ? result.error : ''
  const [claimOpen, setClaimOpen] = useState(false)
  useEffect(() => {
    let active = true
    api.get(`/items/${id}`)
      .then(({ data }) => { if (active) setResult({ id, item: data.item, error: '' }) })
      .catch((cause) => { if (active) setResult({ id, item: null, error: getErrorMessage(cause) }) })
    return () => { active = false }
  }, [id])
  if (error) return <div className="center-page"><EmptyState title="We couldn’t find that item." description={error} action={<Link className="button button-dark" to="/browse">Back to listings</Link>} /></div>
  if (!item) return <LoadingPage />
  const reportedById = item.reportedBy?._id || item.reportedBy
  const isOwner = user && String(reportedById) === user.id
  return <div className="browse-page"><PublicHeader /><div className="detail-wrap"><Link className="text-link" to="/browse"><ArrowRight className="back-arrow" size={15} /> Back to listings</Link><div className="detail-grid">
    <div className={`detail-image ${!item.image ? `illustration illustration-${(item.itemName.length % 4) + 1}` : ''}`}>{item.image ? <img src={item.image} alt={item.itemName} /> : <ItemIllustration item={item} />}</div>
    <div className="detail-copy"><span className={`type-badge ${item.itemType.toLowerCase()}`}>{item.itemType}</span><div className="eyebrow">{item.category}</div><h1>{item.itemName}</h1><p>{item.description}</p><div className="detail-facts"><div><span>Current status</span><strong><StatusBadge>{item.itemStatus}</StatusBadge></strong></div><div><span>Last seen</span><strong>{formatDate(item.dateOfIncident)}</strong></div><div><span>Campus spot</span><strong><MapPin size={15} />{item.location}</strong></div><div><span>Shared by</span><strong>{item.reportedBy?.name || 'Campus community'}</strong></div></div>
      {isOwner ? <p className="safe-contact">This is your report. Your private details are only visible to you and campus staff.</p> : item.itemType === 'Found' ? item.itemStatus === 'Active' ? <button className="button button-terracotta full-button" onClick={() => user ? setClaimOpen(true) : navigate('/login', { state: { from: location } })}>This might be mine <Heart size={16} /></button> : <p className="safe-contact">This item is no longer available for new claims.</p> : item.itemStatus === 'Active' ? <ContactReporter item={item} /> : <p className="safe-contact">This report is no longer active.</p>}
      {!user && <p className="signin-note">A campus account is needed to submit a claim.</p>}
    </div></div></div><FooterCompact />{claimOpen && <ClaimModal item={item} onClose={() => setClaimOpen(false)} />}
  </div>
}

function ClaimModal({ item, onClose }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const closeTimer = useRef(null)
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  async function submit(event) {
    event.preventDefault(); setMessage('')
    const form = new FormData(event.currentTarget)
    const uploadError = imageUploadError(form, 'evidence')
    if (uploadError) { setMessage(uploadError); return }
    setBusy(true)
    try { await api.post(`/items/${item._id}/claims`, form); setMessage('Your claim is in for review. We’ll keep you posted.'); closeTimer.current = setTimeout(onClose, 1600) }
    catch (error) { setMessage(getErrorMessage(error)) }
    finally { setBusy(false) }
  }
  return <Modal title="Tell us why it’s yours" onClose={onClose}><p className="modal-intro">A few details help our team match this item to its owner.</p><form className="form-stack" onSubmit={submit}><label>What makes you think it’s yours?<textarea name="ownershipDescription" required minLength="10" placeholder="Share what happened and when you last had it." /></label><label>Distinctive details<textarea name="identifyingFeatures" required minLength="5" placeholder="Anything unique that wouldn’t be visible in the listing?" /></label><label>Purchase details <span className="optional">(optional)</span><textarea name="purchaseDetails" maxLength="1000" placeholder="When or where you got the item, if you remember." /></label><label>Supporting evidence <span className="optional">(optional, JPG/PNG/WebP, max 5 MB)</span><input name="evidence" type="file" accept="image/jpeg,image/png,image/webp" /></label><label>Anything else? <span className="optional">(optional)</span><textarea name="additionalRemarks" /></label>{message && <p className={message.startsWith('Your claim') ? 'success-message' : 'inline-error'}>{message}</p>}<button disabled={busy} className="button button-terracotta full-button">{busy ? 'Sending…' : 'Submit claim'} <ArrowRight size={16} /></button></form></Modal>
}

function ContactReporter({ item }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function contact() {
    if (!user) { navigate('/login', { state: { from: location } }); return }
    setBusy(true)
    try {
      await api.post(`/items/${item._id}/contact`)
      setMessage('Your contact request has been sent privately.')
    } catch (error) { setMessage(getErrorMessage(error)) }
    finally { setBusy(false) }
  }
  const sent = message.startsWith('Your contact')
  return <><button className="button button-outline full-button" onClick={contact} disabled={busy || sent}>{busy ? 'Sending…' : sent ? 'Request sent' : 'Ask about this item'} <ArrowRight size={15} /></button>{message ? <p className={sent ? 'success-message' : 'inline-error'}>{message}</p> : <div className="safe-contact"><ShieldCheck size={18} /><span>Send a private contact request. Your email stays hidden from public listings.</span></div>}</>
}

function AuthPage({ register = false }) {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={location.state?.from?.pathname || roleHome[user.role]} replace />
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const { data } = await api.post(register ? '/auth/register' : '/auth/login', values)
      signIn(data); navigate(location.state?.from?.pathname || roleHome[data.user.role], { replace: true })
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="auth-page"><div className="auth-visual"><Brand inverse /><div className="auth-quote"><span className="quote-mark">“</span><h2>Somewhere on campus, someone’s looking out for you.</h2><p>Bring a little more found to your day.</p><div className="auth-art"><div className="auth-art-plant"><i /><i /><i /><i /><b /></div><div className="auth-art-book" /><div className="auth-art-card"><span>UNIVERSITY</span><b>U</b><i>GOOD THINGS FOUND</i></div></div></div><span className="auth-copyright">A campus community initiative · UniFind</span></div>
    <div className="auth-form-side"><Link className="auth-back" to="/">← Back to home</Link><div className="auth-form-wrap"><div className="eyebrow">{register ? 'A GOOD PLACE TO START' : 'WELCOME BACK'}</div><h1>{register ? 'Find your people.' : 'Good to see you.'}</h1><p className="auth-lede">{register ? 'Join your campus community. It only takes a minute.' : 'Sign in to pick up where you left off.'}</p>
      <form className="form-stack" onSubmit={submit}>{register && <label>Your name<input name="name" required minLength="2" autoComplete="name" placeholder="e.g. Alex Morgan" /> </label>}
        <label>University email<input name="email" type="email" required autoComplete="email" placeholder="you@university.edu" /></label>
        {register && <label>Student / staff ID<input name="universityId" required placeholder="Your campus ID" /></label>}
        <label>Password<div className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 8 characters' : 'Your password'} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        {!register && <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>}
        {error && <p className="inline-error">{error}</p>}
        <button className="button button-dark full-button" disabled={busy}>{busy ? 'One moment…' : register ? 'Create my account' : 'Sign in'} <ArrowRight size={16} /></button>
      </form><p className="auth-switch">{register ? 'Already part of the community?' : 'New to UniFind?'} <Link to={register ? '/login' : '/register'} state={location.state}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      <div className="auth-safety"><ShieldCheck size={17} /><span>Your details stay within your university community.</span></div>
    </div></div></div>
}

function ForgotPasswordPage() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const { data } = await api.post('/auth/forgot-password', Object.fromEntries(new FormData(event.currentTarget)))
      setMessage(data.message)
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="auth-page"><div className="auth-visual"><Brand inverse /><div className="auth-quote"><span className="quote-mark">“</span><h2>We’ll help you find your way back in.</h2><p>Your campus team is here to help.</p></div><span className="auth-copyright">A campus community initiative · UniFind</span></div><div className="auth-form-side"><Link className="auth-back" to="/login">← Back to sign in</Link><div className="auth-form-wrap"><div className="eyebrow">ACCOUNT SUPPORT</div><h1>Password help.</h1><p className="auth-lede">Share your university email and campus ID. We’ll ask the campus team to help verify your account.</p><form className="form-stack" onSubmit={submit}><label>University email<input name="email" type="email" required autoComplete="email" placeholder="you@university.edu" /></label><label>Student / staff ID<input name="universityId" required placeholder="Your campus ID" /></label>{error && <p className="inline-error">{error}</p>}{message && <p className="success-message">{message}</p>}<button disabled={busy} className="button button-dark full-button">{busy ? 'Sending…' : 'Request help'} <ArrowRight size={16} /></button></form><p className="auth-switch">Remembered your password? <Link to="/login">Sign in</Link></p></div></div></div>
}

function Dashboard() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [items, setItems] = useState([])
  const [claims, setClaims] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(() => location.state?.tab || 'overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [removalTarget, setRemovalTarget] = useState(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')
  function leaveWorkspace() { signOut() }
  function removeReport(item) {
    setRemovalTarget(item)
    setRemoveError('')
  }
  async function confirmRemoveReport() {
    setRemoveBusy(true)
    try {
      await api.delete(`/items/${removalTarget._id}`)
      setRemovalTarget(null)
      await refresh()
    } catch (cause) {
      setRemoveError(getErrorMessage(cause))
    } finally {
      setRemoveBusy(false)
    }
  }
  async function refresh() {
    try {
      const [reports, ownClaims, updates] = await Promise.all([api.get('/items/mine'), api.get('/claims/mine'), api.get('/notifications')])
      setItems(reports.data.items); setClaims(ownClaims.data.claims); setNotifications(updates.data.notifications); setUnreadNotifications(updates.data.unread); setError('')
      signalNotificationUpdate()
    } catch (cause) { setError(getErrorMessage(cause)) }
  }
  useEffect(() => { refresh() }, [])
  return <div className="app-shell">
    <Sidebar active={tab} onSelect={setTab} role="student" onSignOut={leaveWorkspace} />
    <main className="workspace-main"><WorkspaceHeader user={user} onMenu={() => setMenuOpen(!menuOpen)} onSignOut={leaveWorkspace} />
      <div className="workspace-content">{error && <p className="inline-error">{error}</p>}
        {tab === 'overview' ? <>
          <div className="workspace-title-row"><div><div className="eyebrow">YOUR CAMPUS CORNER</div><h1>Good morning, {user.name.split(' ')[0]}.</h1><p>Here’s what’s happening with your reports.</p></div><div className="quick-report-actions"><Link className="button button-terracotta" to="/report/lost"><Plus size={16} /> Report lost</Link><Link className="button button-outline" to="/report/found"><Heart size={15} /> Report found</Link></div></div>
          <div className="metric-grid"><Metric icon={<FilePlus2 />} label="My reports" value={items.length} note="Across lost & found" tone="sage" /><Metric icon={<ClipboardCheck />} label="Active claims" value={claims.filter((claim) => claim.claimStatus !== 'Completed' && claim.claimStatus !== 'Rejected').length} note="We’ll keep you posted" tone="lavender" /><Metric icon={<Bell />} label="Unread updates" value={unreadNotifications} note="Little things to know" tone="amber" /></div>
          <div className="dashboard-columns"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">YOUR ACTIVITY</div><h2>Recent reports</h2></div><button className="small-link" onClick={() => setTab('reports')}>View all <ArrowRight size={14} /></button></div>
            {items.length ? <div className="activity-list">{items.slice(0, 4).map((item) => <div className="activity-row" key={item._id}><span className={`activity-symbol ${item.itemType.toLowerCase()}`}>{item.itemType === 'Lost' ? <Search size={17} /> : <Heart size={17} />}</span><div className="activity-info"><strong>{item.itemName}</strong><small>{item.itemType} · {formatDate(item.createdAt)}</small></div><StatusBadge>{item.approvalStatus}</StatusBadge></div>)}</div> : <EmptyState compact title="Your story starts here." description="Report something lost or found and it’ll show up here." action={<Link to="/report/lost" className="small-link">Make your first report <ArrowRight size={14} /></Link>} />}
          </section><section className="panel notice-panel"><div className="panel-heading"><div><div className="eyebrow">LITTLE UPDATES</div><h2>In the loop</h2></div><Bell size={18} /></div>{notifications.slice(0, 3).map((note) => <div className="notice-row" key={note._id}><span className={`notice-dot ${note.isRead ? '' : 'unread'}`} /><div><strong>{note.title}</strong><p>{note.message}</p><small>{timeAgo(note.createdAt)}</small></div></div>)}{!notifications.length && <p className="subtle-copy">The quiet kind of inbox. We’ll let you know when something changes.</p>}<Link className="small-link" to="/notifications">All updates <ArrowRight size={14} /></Link></section></div>
          <section className="panel claims-panel"><div className="panel-heading"><div><div className="eyebrow">KEEPING AN EYE OUT</div><h2>Your claims</h2></div><button className="small-link" onClick={() => setTab('claims')}>View all <ArrowRight size={14} /></button></div>{claims.length ? <div className="activity-list">{claims.slice(0, 3).map((claim) => <div className="activity-row" key={claim._id}><span className="activity-symbol claim"><Heart size={17} /></span><div className="activity-info"><strong>{claim.itemId?.itemName || 'Campus item'}</strong><small>Submitted {formatDate(claim.createdAt)}</small></div><StatusBadge>{claim.claimStatus}</StatusBadge></div>)}</div> : <p className="subtle-copy">No claims yet. If something in the listings looks familiar, tell us about it.</p>}</section>
        </> : tab === 'reports' ? <ReportsSection items={items} onEdit={setEditingItem} onDelete={removeReport} /> : tab === 'claims' ? <ClaimsSection claims={claims} /> : <NotificationsSection notifications={notifications} refresh={refresh} />}
      </div>
    </main>
    {menuOpen && <MobileNav onClose={() => setMenuOpen(false)} onSelect={setTab} role="student" onSignOut={leaveWorkspace} />}
    {editingItem && <ReportEditModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={async () => { setEditingItem(null); await refresh() }} />}
    {removalTarget && <Modal title="Remove this report?" onClose={() => setRemovalTarget(null)}>
      <p className="modal-intro">Remove “{removalTarget.itemName}” from your reports? This can’t be undone.</p>
      {removeError && <p className="inline-error">{removeError}</p>}
      <div className="review-actions"><button disabled={removeBusy} onClick={() => setRemovalTarget(null)}>Cancel</button><button disabled={removeBusy} onClick={confirmRemoveReport}>{removeBusy ? 'Removing…' : 'Remove report'}</button></div>
    </Modal>}
  </div>
}

function Sidebar({ active, onSelect, role, onSignOut }) {
  const nav = role === 'student' ? [
    { id: 'overview', label: 'My corner', icon: <LayoutDashboard size={18} /> },
    { id: 'reports', label: 'My reports', icon: <FilePlus2 size={18} /> },
    { id: 'claims', label: 'My claims', icon: <Heart size={18} /> },
    { id: 'updates', label: 'Updates', icon: <Bell size={18} /> },
  ] : role === 'admin' ? [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'reports', label: 'Item reports', icon: <FilePlus2 size={18} /> },
    { id: 'claims', label: 'Claims', icon: <ClipboardCheck size={18} /> },
    { id: 'users', label: 'People', icon: <UserRound size={18} /> },
  ] : [{ id: 'overview', label: 'Handover desk', icon: <PackageCheck size={18} /> }]
  return <aside className="sidebar"><Brand /><div className="side-label">YOUR SPACE</div><nav className="side-nav">{nav.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onSelect(item.id)}>{item.icon}{item.label}{item.id === 'updates' && <span className="nav-live-dot" />}</button>)}</nav><div className="sidebar-bottom"><Link to="/browse"><Compass size={17} /> Explore listings</Link><div className="sidebar-help"><CircleHelp size={18} /><div><strong>Need a hand?</strong><small>We’re around campus.</small></div><ArrowRight size={15} /></div><button className="sidebar-signout" onClick={onSignOut}><LogOut size={17} /> Sign out</button></div></aside>
}

function WorkspaceHeader({ user, onMenu, onSignOut }) {
  const [notes, setNotes] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notesError, setNotesError] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    const loadNotifications = () => {
      api.get('/notifications').then(({ data }) => {
        if (active) { setNotes(data.notifications); setUnreadCount(data.unread); setNotesError('') }
      }).catch((cause) => { if (active) setNotesError(getErrorMessage(cause)) })
    }
    loadNotifications()
    window.addEventListener('unifind:notifications-updated', loadNotifications)
    return () => {
      active = false
      window.removeEventListener('unifind:notifications-updated', loadNotifications)
    }
  }, [])
  return <header className="workspace-header"><button className="mobile-menu" onClick={onMenu} aria-label="Open navigation menu"><Menu size={21} /></button><div className="header-breadcrumb">CAMPUS COMMUNITY <ChevronRight size={14} /> YOUR SPACE</div><div className="header-actions"><div className="notification-wrap"><button className="header-icon" aria-label="Notifications" onClick={() => setOpen(!open)}><Bell size={19} />{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</button>{open && <div className="notification-popover"><div className="panel-heading"><strong>Little updates</strong><Link to="/notifications" onClick={() => setOpen(false)}>See all</Link></div>{notesError && <p className="inline-error">{notesError}</p>}{notes.slice(0, 4).map((note) => <div key={note._id} className="popover-note"><span className={!note.isRead ? 'notice-dot unread' : 'notice-dot'} /><div><strong>{note.title}</strong><p>{note.message}</p></div></div>)}{!notes.length && !notesError && <p className="subtle-copy">You’re all caught up.</p>}</div>}</div><div className="profile-menu"><Link to="/profile" className="profile-trigger"><span className="user-avatar">{user.name[0]}</span><span><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></span><ChevronDown size={15} /></Link><button className="header-signout" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div></div></header>
}

function MobileNav({ onClose, onSelect, role, onSignOut }) {
  return <div className="mobile-nav-sheet"><button onClick={onClose} aria-label="Close navigation"><X size={20} /></button><Sidebar active="" onSelect={(tab) => { onSelect(tab); onClose() }} role={role} onSignOut={onSignOut} /></div>
}

function ReportsSection({ items, onEdit, onDelete }) {
  return <section><div className="workspace-title-row"><div><div className="eyebrow">YOUR PAPER TRAIL</div><h1>My reports</h1><p>Everything you’ve shared with the campus community.</p></div><Link to="/report/lost" className="button button-terracotta"><Plus size={16} /> New report</Link></div>{items.length ? <div className="item-grid">{items.map((item) => <article className="panel member-report-card" key={item._id}><ItemCard item={item} /><div className="member-report-actions">{item.approvalStatus === 'Pending Approval' && <button className="button button-outline" onClick={() => onEdit(item)}>Edit report</button>}<button className="button button-outline" onClick={() => onDelete(item)}>Remove report</button></div></article>)}</div> : <EmptyState title="No reports yet." description="When you share a lost or found item, it’ll live here." action={<Link className="button button-dark" to="/report/lost">Make a report</Link>} />}</section>
}

function ReportEditModal({ item, onClose, onSaved }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const uploadError = imageUploadError(form, 'image')
    if (uploadError) { setError(uploadError); return }
    setBusy(true)
    try {
      await api.patch(`/items/${item._id}`, form)
      await onSaved()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return <Modal title="Edit your report" onClose={onClose}>
    <p className="modal-intro">Pending reports can be updated while the campus team reviews them.</p>
    <form className="form-stack" onSubmit={submit}>
      <label>Item name<input name="itemName" required minLength="2" maxLength="120" defaultValue={item.itemName} /></label>
      <div className="form-two"><label>Category<select name="category" defaultValue={item.category} required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Date of incident<input name="dateOfIncident" type="date" required max={INITIAL_DATE.toISOString().slice(0, 10)} defaultValue={String(item.dateOfIncident).slice(0, 10)} /></label></div>
      <label>Campus location<input name="location" required minLength="2" maxLength="200" defaultValue={item.location} /></label>
      <label>Description<textarea name="description" required minLength="10" maxLength="2000" defaultValue={item.description} /></label>
      <label>Distinctive details <span className="optional">(private)</span><textarea name="identifyingFeatures" maxLength="1000" defaultValue={item.identifyingFeatures || ''} /></label>
      {item.itemType === 'Lost' && <label>Additional information <span className="optional">(private)</span><textarea name="additionalInformation" maxLength="1000" defaultValue={item.additionalInformation || ''} /></label>}
      {item.itemType === 'Found' && <label>Storage location <span className="optional">(private)</span><input name="storageLocation" maxLength="200" defaultValue={item.storageLocation || ''} /></label>}
      <label>Replace photo <span className="optional">(optional, JPG/PNG/WebP, max 5 MB)</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <input type="hidden" name="itemType" value={item.itemType} />
      {error && <p className="inline-error">{error}</p>}
      <button disabled={busy} className="button button-dark full-button">{busy ? 'Saving…' : 'Save changes'} <Check size={16} /></button>
    </form>
  </Modal>
}
function ClaimsSection({ claims }) {
  return <section><div className="workspace-title-row"><div><div className="eyebrow">HOPING FOR A MATCH</div><h1>My claims</h1><p>We’ll keep you in the loop as each one is reviewed.</p></div></div><div className="panel">{claims.length ? <div className="activity-list">{claims.map((claim) => <div className="activity-row" key={claim._id}><span className="activity-symbol claim"><Heart size={17} /></span><div className="activity-info"><strong>{claim.itemId?.itemName || 'Campus item'}</strong><small>Submitted {formatDate(claim.createdAt)} {claim.adminRemarks && `· ${claim.adminRemarks}`}</small></div><StatusBadge>{claim.claimStatus}</StatusBadge></div>)}</div> : <EmptyState compact title="No active claims." description="Found something that might be yours? Start with a claim from its detail page." action={<Link className="small-link" to="/browse">Explore found items <ArrowRight size={14} /></Link>} />}</div></section>
}
function NotificationsSection({ notifications, refresh }) {
  const [error, setError] = useState('')
  async function markAll() {
    try { await api.patch('/notifications/read-all'); setError(''); await refresh() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  async function markRead(id) {
    try { await api.patch(`/notifications/${id}/read`); setError(''); await refresh() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  return <section><div className="workspace-title-row"><div><div className="eyebrow">A LITTLE SOMETHING TO KNOW</div><h1>Your updates</h1><p>Report reviews, claim decisions and handover notes.</p></div><button className="button button-outline" onClick={markAll}><CheckCheck size={16} /> Mark all read</button></div>{error && <p className="inline-error">{error}</p>}<div className="panel activity-list">{notifications.length ? notifications.map((note) => <div className="notice-row full-notice" key={note._id}><span className={!note.isRead ? 'notice-dot unread' : 'notice-dot'} /><div><strong>{note.title}</strong><p>{note.message}</p><small>{timeAgo(note.createdAt)}</small></div>{!note.isRead && <button className="small-link" onClick={() => markRead(note._id)}>Mark read</button>}</div>) : <EmptyState compact title="Nothing new." description="When something needs your attention, it’ll appear here." />}</div></section>
}

function ReportPage() {
  const { type = 'lost' } = useParams()
  const { user, signOut } = useAuth()
  const isFound = type === 'found'
  const itemType = isFound ? 'Found' : 'Lost'
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (submitted) return
    setBusy(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const uploadError = imageUploadError(form, 'image')
    if (uploadError) {
      setMessage(uploadError)
      setBusy(false)
      return
    }
    try {
      await api.post('/items', form)
      setSubmitted(true)
      setMessage('Your report has been submitted and is waiting for campus review.')
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const heading = isFound ? 'Report a Found Item' : 'Report a Lost Item'
  const supportingText = isFound
    ? 'Found something on campus? Share its details and help reunite it with its owner.'
    : "Tell us what you've lost. Providing accurate details will help your campus community find it."
  return <div className="app-shell">
    <Sidebar active="reports" onSelect={(tab) => navigate('/dashboard', { state: { tab } })} role="student" onSignOut={signOut} />
    <main className="workspace-main">
      <WorkspaceHeader user={user} onMenu={() => navigate('/dashboard', { state: { tab: 'reports' } })} onSignOut={signOut} />
      <div className="workspace-content report-layout">
        <div className={`report-page report-page-${type}`}>
          <Link to="/dashboard" className="small-link report-back">← Your corner</Link>
          <header className="report-heading">
            <div className="eyebrow">{isFound ? 'HELP SOMETHING FIND ITS WAY HOME' : 'LET YOUR CAMPUS HELP LOOK'}</div>
            <h1>{heading}</h1>
            <p>{supportingText}</p>
          </header>
          <nav className="switch-report" aria-label="Choose report type">
            <span>What are you reporting?</span>
            <Link to="/report/lost" onClick={() => { setMessage(''); setSubmitted(false) }} className={!isFound ? 'selected' : ''} aria-current={!isFound ? 'page' : undefined}>Lost item</Link>
            <Link to="/report/found" onClick={() => { setMessage(''); setSubmitted(false) }} className={isFound ? 'selected' : ''} aria-current={isFound ? 'page' : undefined}>Found item</Link>
          </nav>
          <form className="report-form" onSubmit={submit}>
            <div className="report-fields">
              <label className="report-field">
                <span>Item Name</span>
                <input name="itemName" required minLength="2" maxLength="120" placeholder="e.g. olive green water bottle" />
              </label>
              <label className="report-field">
                <span>Category</span>
                <select name="category" required defaultValue="">
                  <option value="" disabled>Choose a category</option>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="report-field">
                <span>{isFound ? 'Date Found' : 'Date Lost'}</span>
                <input name="dateOfIncident" type="date" required max={INITIAL_DATE.toISOString().slice(0, 10)} />
              </label>
              <label className="report-field">
                <span>{isFound ? 'Location Where Found' : 'Approximate Location'}</span>
                <input name="location" required minLength="2" maxLength="200" placeholder={isFound ? 'Where on campus did you find it?' : 'Where did you last see it?'} />
              </label>
              <label className="report-field report-field-wide">
                <span>Item Description</span>
                <textarea name="description" required minLength="10" maxLength="2000" placeholder="Describe the item, its colour and condition." />
              </label>
              <label className="report-field">
                <span>Distinguishing Features</span>
                <textarea name="identifyingFeatures" maxLength="1000" placeholder="Private details that can help verify ownership." />
              </label>
              {isFound ? <label className="report-field">
                <span>Current Storage Location / Collection Point <span className="optional">Optional</span></span>
                <input name="storageLocation" maxLength="200" placeholder="e.g. campus help desk" />
              </label> : <label className="report-field">
                <span>Additional Information <span className="optional">Optional</span></span>
                <textarea name="additionalInformation" maxLength="1000" placeholder="Anything else that could help your community." />
              </label>}
              <label className="report-field report-field-wide">
                <span>Upload Photo <span className="optional">Optional · JPG, PNG or WebP · up to 5 MB</span></span>
                <input className="report-file-input" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
              </label>
            </div>
            {isFound && <div className="report-privacy-notice" role="note">
              <ShieldCheck size={19} />
              <p><strong>Keep identifying details private.</strong> Avoid including personal information or distinctive ownership clues in the public description. Share sensitive details only in the private features field.</p>
            </div>}
            {message && <p className={submitted ? 'report-success' : 'inline-error'} role={submitted ? 'status' : 'alert'}>{message}</p>}
            <div className="report-submit-row">
              <p>Reports are reviewed by the campus team before appearing publicly.</p>
              {submitted ? <Link className="button button-dark" to="/dashboard" state={{ tab: 'reports' }}>View my reports <ArrowRight size={16} /></Link>
                : <button disabled={busy} className={`button ${isFound ? 'button-dark' : 'button-terracotta'}`} type="submit">{busy ? 'Submitting…' : `Submit ${itemType} Report`} <ArrowRight size={16} /></button>}
            </div>
            <input type="hidden" name="itemType" value={itemType} />
          </form>
        </div>
      </div>
    </main>
  </div>
}

function AdminPage() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [tab, setTab] = useState(() => ['overview', 'reports', 'claims', 'users'].includes(location.state?.tab) ? location.state.tab : 'overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [data, setData] = useState(null)
  const [items, setItems] = useState([])
  const [claims, setClaims] = useState([])
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [claimDecision, setClaimDecision] = useState(null)
  const [claimRemarks, setClaimRemarks] = useState('')
  const [claimReviewBusy, setClaimReviewBusy] = useState(false)
  const [claimReviewError, setClaimReviewError] = useState('')
  const [itemToRemove, setItemToRemove] = useState(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')
  function leaveWorkspace() { signOut() }
  async function load() {
    try {
      const [overview, allItems, allClaims, allUsers] = await Promise.all([api.get('/admin/overview'), api.get('/admin/items'), api.get('/admin/claims'), api.get('/admin/users')])
      setData(overview.data); setItems(allItems.data.items); setClaims(allClaims.data.claims); setUsers(allUsers.data.users); setError('')
    } catch (cause) { setError(getErrorMessage(cause)) }
  }
  useEffect(() => { load() }, [])
  async function reviewItem(id, approvalStatus) { try { await api.patch(`/admin/items/${id}/review`, { approvalStatus }); load() } catch (cause) { setError(getErrorMessage(cause)) } }
  async function reviewClaim(id, claimStatus) {
    if (claimStatus === 'Rejected') {
      setClaimDecision({ id, claimStatus })
      setClaimRemarks('')
      setClaimReviewError('')
      return
    }
    try { await api.patch(`/admin/claims/${id}/review`, { claimStatus, adminRemarks: '' }); await load() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  async function changeUser(id, value) { try { const { data } = await api.patch(`/admin/users/${id}`, value); setUsers((current) => data.user.role === 'admin' ? current.filter((person) => person._id !== id) : current.map((person) => person._id === id ? { ...person, ...data.user } : person)); return true } catch (cause) { setError(getErrorMessage(cause)); return false } }
  async function changeItemStatus(id, itemStatus) { try { await api.patch(`/admin/items/${id}/status`, { itemStatus }); load() } catch (cause) { setError(getErrorMessage(cause)) } }
  function removeItem(id) {
    setItemToRemove(id)
    setRemoveError('')
  }
  async function submitClaimRejection(event) {
    event.preventDefault()
    if (!claimDecision) return
    setClaimReviewBusy(true)
    try {
      await api.patch(`/admin/claims/${claimDecision.id}/review`, { claimStatus: 'Rejected', adminRemarks: claimRemarks })
      setClaimDecision(null)
      await load()
    } catch (cause) {
      setClaimReviewError(getErrorMessage(cause))
    } finally {
      setClaimReviewBusy(false)
    }
  }
  async function confirmRemoveItem() {
    setRemoveBusy(true)
    try {
      await api.delete(`/items/${itemToRemove}`)
      setItemToRemove(null)
      await load()
    } catch (cause) {
      setRemoveError(getErrorMessage(cause))
    } finally {
      setRemoveBusy(false)
    }
  }
  return <div className="app-shell"><Sidebar active={tab} onSelect={setTab} role="admin" onSignOut={leaveWorkspace} /><main className="workspace-main"><WorkspaceHeader user={user} onMenu={() => setMenuOpen(!menuOpen)} onSignOut={leaveWorkspace} /><div className="workspace-content">
    {error && <p className="inline-error">{error}</p>}
    {tab === 'overview' ? <><div className="workspace-title-row"><div><div className="eyebrow">A LITTLE ORDER, A LOT OF CARE</div><h1>Campus, in good hands.</h1><p>A clear view of what’s moving around UniFind today.</p></div><span className="date-stamp">{INITIAL_DATE.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>    <div className="metric-grid admin-metrics"><Metric icon={<UserRound />} label="Student accounts" value={data?.stats.users ?? '—'} note="All registered students" tone="sage" trend="Growing" /><Metric icon={<Search />} label="Lost reports" value={data?.stats.lost ?? '—'} note="All-time reports" tone="terracotta" /><Metric icon={<Heart />} label="Found items" value={data?.stats.found ?? '—'} note="All-time reports" tone="lavender" /><Metric icon={<PackageCheck />} label="Returned home" value={data?.stats.returned ?? '—'} note="Successful handovers" tone="amber" /></div>    <div className="admin-grid"><section className="panel chart-panel"><div className="panel-heading"><div><div className="eyebrow">SIX-MONTH PICTURE</div><h2>Reports and recoveries</h2></div><span className="chart-legend"><i /> Lost <i className="legend-found" /> Found <i className="legend-returned" /> Returned</span></div><Suspense fallback={<div className="chart-loading">Preparing campus stats…</div>}><AdminChart rows={data?.monthly || []} /></Suspense></section><section className="panel pending-panel"><div className="panel-heading"><div><div className="eyebrow">NEEDS A LOOK</div><h2>Waiting for review</h2></div><span className="pending-total">{data?.pendingItems?.length || 0}</span></div>{data?.pendingItems?.length ? data.pendingItems.map((item) => <div className="pending-row" key={item._id}><div className="pending-item-icon">{item.itemType === 'Found' ? <Heart size={17} /> : <Search size={17} />}</div><div><strong>{item.itemName}</strong><small>{item.itemType} · {item.reportedBy?.name}</small></div><button className="small-link" onClick={() => setTab('reports')}>Review <ArrowRight size={14} /></button></div>) : <p className="subtle-copy">All clear. No reports waiting for a review.</p>}</section></div>    <div className="admin-lower"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">THE LATEST</div><h2>Recent reports</h2></div><button className="small-link" onClick={() => setTab('reports')}>Manage all <ArrowRight size={14} /></button></div>{(data?.recentItems || []).slice(0, 4).map((item) => <div className="activity-row" key={item._id}><span className={`activity-symbol ${item.itemType.toLowerCase()}`}>{item.itemType === 'Lost' ? <Search size={17} /> : <Heart size={17} />}</span><div className="activity-info"><strong>{item.itemName}</strong><small>{item.itemType} · {item.reportedBy?.name || 'Campus community'}</small></div><StatusBadge>{item.approvalStatus}</StatusBadge></div>)}</section><CategoryPanel categories={data?.categories || []} /><section className="admin-claims-card"><div className="eyebrow">CLAIMS NEED KIND JUDGEMENT</div><h2>{data?.stats.pendingClaims ?? '—'} claims waiting.</h2><p>Every good match deserves a thoughtful review. Check the details and evidence before deciding.</p><button className="button button-dark" onClick={() => setTab('claims')}>Review claims <ArrowRight size={15} /></button></section></div></> :
      tab === 'reports' ? <AdminReports items={items} reviewItem={reviewItem} changeItemStatus={changeItemStatus} removeItem={removeItem} /> :
      tab === 'claims' ? <AdminClaims claims={claims} reviewClaim={reviewClaim} /> :
      <AdminUsers users={users} changeUser={changeUser} />}
  </div></main>{menuOpen && <MobileNav onClose={() => setMenuOpen(false)} onSelect={setTab} role="admin" onSignOut={leaveWorkspace} />}
    {claimDecision && <Modal title="Decline this claim?" onClose={() => setClaimDecision(null)}>
      <form className="form-stack" onSubmit={submitClaimRejection}>
        <p className="modal-intro">Share a short reason with the claimant. This note will appear in their updates.</p>
        <label>Reason <span className="optional">(optional)</span><textarea value={claimRemarks} onChange={(event) => setClaimRemarks(event.target.value)} maxLength="1000" /></label>
        {claimReviewError && <p className="inline-error">{claimReviewError}</p>}
        <div className="review-actions"><button type="button" disabled={claimReviewBusy} onClick={() => setClaimDecision(null)}>Cancel</button><button disabled={claimReviewBusy}>{claimReviewBusy ? 'Saving…' : 'Decline claim'}</button></div>
      </form>
    </Modal>}
    {itemToRemove && <Modal title="Remove this report?" onClose={() => setItemToRemove(null)}>
      <p className="modal-intro">Remove this report? This can’t be undone.</p>
      {removeError && <p className="inline-error">{removeError}</p>}
      <div className="review-actions"><button disabled={removeBusy} onClick={() => setItemToRemove(null)}>Cancel</button><button disabled={removeBusy} onClick={confirmRemoveItem}>{removeBusy ? 'Removing…' : 'Remove report'}</button></div>
    </Modal>}
  </div>
}

function CategoryPanel({ categories: rows }) {
  const maximum = rows[0]?.count || 0
  return <section className="panel category-panel"><div className="panel-heading"><div><div className="eyebrow">WHERE THINGS GO MISSING</div><h2>Top categories</h2></div></div>{rows.length ? rows.map((row) => <div className="category-row" key={row._id}><span>{row._id}</span><div className="category-bar"><i style={{ width: `${Math.max(4, (row.count / maximum) * 100)}%` }} /></div><strong>{row.count}</strong></div>) : <p className="subtle-copy">Category trends will appear as reports come in.</p>}</section>
}

function AdminReports({ items, reviewItem, changeItemStatus, removeItem }) {
  const [filter, setFilter] = useState('Pending Approval')
  const rows = items.filter((item) => filter === 'All' || item.approvalStatus === filter)
  return <section><div className="workspace-title-row"><div><div className="eyebrow">COMMUNITY REPORTS</div><h1>Item reports</h1><p>Give each report a quick and thoughtful review.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Pending Approval</option><option>Approved</option><option>Rejected</option><option>All</option></select></div><div className="panel">{rows.length ? rows.map((item) => <div className="review-row" key={item._id}><div className="review-thumb">{item.image ? <img src={item.image} alt="" /> : <ItemIllustration item={item} />}</div><div className="review-info"><strong>{item.itemName}</strong><small>{item.itemType} · {item.category} · {item.location}</small><small>By {item.reportedBy?.name} · {formatDate(item.createdAt)}</small><p>{item.description}</p>{item.identifyingFeatures && <small>Private details: {item.identifyingFeatures}</small>}</div><StatusBadge>{item.approvalStatus}</StatusBadge>{item.approvalStatus === 'Pending Approval' && <div className="review-actions"><button title="Approve" aria-label={`Approve ${item.itemName}`} onClick={() => reviewItem(item._id, 'Approved')}><Check size={16} /></button><button title="Reject" aria-label={`Reject ${item.itemName}`} onClick={() => reviewItem(item._id, 'Rejected')}><X size={16} /></button></div>}{item.approvalStatus === 'Approved' && !['Awaiting Collection', 'Returned'].includes(item.itemStatus) && <select className="item-status-select" aria-label={`Set item status for ${item.itemName}`} value={item.itemStatus} onChange={(event) => changeItemStatus(item._id, event.target.value)}><option>Active</option><option>Closed</option></select>}<button className="remove-item" title="Remove report" aria-label={`Remove report ${item.itemName}`} onClick={() => removeItem(item._id)}><Trash2 size={15} /></button></div>) : <EmptyState compact title="Nothing waiting here." description="Try another status filter." />}</div></section>
}

function AdminClaims({ claims, reviewClaim }) {
  const [filter, setFilter] = useState('Pending Review')
  const [evidenceError, setEvidenceError] = useState('')
  const rows = claims.filter((claim) => filter === 'All' || claim.claimStatus === filter)
  async function viewEvidence(id) {
    setEvidenceError('')
    try {
      const { data } = await api.get(`/admin/claims/${id}/evidence`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'claim-supporting-evidence'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { setEvidenceError(getErrorMessage(error)) }
  }
  return <section><div className="workspace-title-row"><div><div className="eyebrow">A GOOD MATCH, CAREFULLY CHECKED</div><h1>Claims</h1><p>Review the details shared by someone who thinks they’ve found their item.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Pending Review</option><option>Approved</option><option>Rejected</option><option>Completed</option><option>All</option></select></div>{evidenceError && <p className="inline-error">{evidenceError}</p>}<div className="panel">{rows.length ? rows.map((claim) => <div className="claim-review" key={claim._id}><div className="claim-head"><div className="activity-symbol claim"><Heart size={17} /></div><div><strong>{claim.itemId?.itemName || 'Campus item'}</strong><small>{claim.claimantId?.name} · {claim.claimantId?.email}</small></div><StatusBadge>{claim.claimStatus}</StatusBadge></div><p><b>Ownership:</b> {claim.ownershipDescription}</p><p><b>Distinctive details:</b> {claim.identifyingFeatures}</p>{claim.purchaseDetails && <p><b>Purchase information:</b> {claim.purchaseDetails}</p>}{claim.supportingEvidence && <button className="small-link evidence-button" onClick={() => viewEvidence(claim._id)}>Download supporting evidence <ArrowRight size={13} /></button>}{claim.claimStatus === 'Pending Review' && <div className="review-actions"><button onClick={() => reviewClaim(claim._id, 'Approved')}><Check size={15} /> Approve</button><button onClick={() => reviewClaim(claim._id, 'Rejected')}><X size={15} /> Decline</button></div>}</div>) : <EmptyState compact title="No claims to review." description="New claims will show up here once submitted." />}</div></section>
}

function AdminUsers({ users, changeUser }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(users)
  const [error, setError] = useState('')
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 250); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    let active = true
    api.get(`/admin/users?search=${encodeURIComponent(query)}`)
      .then(({ data }) => { if (active) { setResults(data.users); setError('') } })
      .catch((cause) => { if (active) setError(getErrorMessage(cause)) })
    return () => { active = false }
  }, [query])
  async function updatePerson(id, value) {
    if (await changeUser(id, value)) {
      setResults((current) => value.role === 'admin' ? current.filter((person) => person._id !== id) : current.map((person) => person._id === id ? { ...person, ...value } : person))
    }
  }
  return <section><div className="workspace-title-row"><div><div className="eyebrow">THE PEOPLE BEHIND THE FINDS</div><h1>Campus community</h1><p>Manage access and keep the community healthy.</p></div></div><div className="panel"><div className="user-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or university ID" /></div>{error && <p className="inline-error">{error}</p>}{results.map((person) => <div className="user-row" key={person._id}><span className="user-avatar">{person.name[0]}</span><div><strong>{person.name}</strong><small>{person.email} · {person.universityId}</small></div><select aria-label={`Role for ${person.name}`} value={person.role} onChange={(event) => updatePerson(person._id, { role: event.target.value })}><option value="student">Student</option><option value="helpdesk">Help Desk</option><option value="admin">Administrator</option></select><button className="button button-outline user-status" onClick={() => updatePerson(person._id, { accountStatus: person.accountStatus === 'active' ? 'inactive' : 'active' })}>{person.accountStatus === 'active' ? 'Deactivate' : 'Activate'}</button></div>)}</div></section>
}

function HelpDeskPage() {
  const { user, signOut } = useAuth()
  const [handover, setHandover] = useState([])
  const [filter, setFilter] = useState('Awaiting Collection')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [completingHandover, setCompletingHandover] = useState(null)
  const [completionBusy, setCompletionBusy] = useState(false)
  const [completionError, setCompletionError] = useState('')
  function leaveWorkspace() { signOut() }
  async function load() {
    try { const { data } = await api.get('/helpdesk/handovers'); setHandover(data.handovers); setError('') }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  useEffect(() => { load() }, [])
  function complete(record) {
    setCompletingHandover(record)
    setCompletionError('')
  }
  async function confirmCompletion(event) {
    event.preventDefault()
    if (!completingHandover) return
    const remarks = new FormData(event.currentTarget).get('remarks')
    setCompletionBusy(true)
    try {
      await api.patch(`/helpdesk/handovers/${completingHandover._id}/complete`, { remarks })
      setCompletingHandover(null)
      await load()
    } catch (cause) {
      setCompletionError(getErrorMessage(cause))
    } finally {
      setCompletionBusy(false)
    }
  }
  const rows = handover.filter((record) => filter === 'All' || record.handoverStatus === filter)
  return <div className="app-shell">
    <Sidebar active="overview" onSelect={() => load()} role="helpdesk" onSignOut={leaveWorkspace} />
    <main className="workspace-main">
      <WorkspaceHeader user={user} onMenu={() => setMenuOpen(!menuOpen)} onSignOut={leaveWorkspace} />
      <div className="workspace-content">
        <div className="workspace-title-row"><div><div className="eyebrow">THE LAST MILE, DONE WITH CARE</div><h1>Welcome to the handover desk.</h1><p>Verify, hand over, and help a good thing find its way back.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Awaiting Collection</option><option>Completed</option><option>All</option></select></div>
        {error && <p className="inline-error">{error}</p>}
        <div className="metric-grid">
          <Metric icon={<PackageCheck />} label="Ready to collect" value={handover.filter((entry) => entry.handoverStatus === 'Awaiting Collection').length} note="Approved claims" tone="amber" />
          <Metric icon={<CheckCheck />} label="Returned home" value={handover.filter((entry) => entry.handoverStatus === 'Completed').length} note="Verified handovers" tone="sage" />
          <Metric icon={<ShieldCheck />} label="Your role" value="Campus" note="Help Desk" tone="lavender" />
        </div>
        <section className="panel handover-panel">
          <div className="panel-heading"><div><div className="eyebrow">CLAIMS WITH A GREEN LIGHT</div><h2>{filter === 'Awaiting Collection' ? 'Awaiting collection' : filter === 'Completed' ? 'Handover history' : 'All handovers'}</h2></div><span className="pending-total">{rows.length}</span></div>
          {rows.length ? rows.map((record) => <div className="handover-row" key={record._id}>
            <div className="handover-icon"><PackageCheck size={20} /></div>
            <div className="handover-info"><strong>{record.itemId?.itemName || 'Campus item'}</strong><span>{record.claimantId?.name} · ID {record.claimantId?.universityId}</span><span>{record.claimantId?.email}</span>{record.itemId?.storageLocation && <small>Stored at: {record.itemId.storageLocation}</small>}{record.itemId?.identifyingFeatures && <small>Identifying details: {record.itemId.identifyingFeatures}</small>}{record.remarks && <small>Handover note: {record.remarks}</small>}</div>
            <StatusBadge>{record.handoverStatus}</StatusBadge>
            {record.handoverStatus === 'Awaiting Collection' && <button className="button button-terracotta" onClick={() => complete(record)}>Confirm collection <Check size={15} /></button>}
          </div>) : <EmptyState compact title="No handovers here." description="Approved claims will appear here when they’re ready for collection." />}
        </section>
      </div>
    </main>
    {menuOpen && <MobileNav onClose={() => setMenuOpen(false)} onSelect={() => load()} role="helpdesk" onSignOut={leaveWorkspace} />}
    {completingHandover && <Modal title="Confirm item collection" onClose={() => setCompletingHandover(null)}>
      <form className="form-stack" onSubmit={confirmCompletion}>
        <p className="modal-intro">Confirm that {completingHandover.claimantId?.name} has collected {completingHandover.itemId?.itemName}.</p>
        <label>Handover note <span className="optional">(optional)</span><textarea name="remarks" maxLength="1000" placeholder="Add a note about the verified handover." /></label>
        {completionError && <p className="inline-error">{completionError}</p>}
        <div className="review-actions"><button type="button" disabled={completionBusy} onClick={() => setCompletingHandover(null)}>Cancel</button><button disabled={completionBusy}>{completionBusy ? 'Saving…' : 'Confirm collection'}</button></div>
      </form>
    </Modal>}
  </div>
}

function ProfilePage() {
  const { user, updateUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function leaveWorkspace() { signOut() }
  async function update(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try { const { data } = await api.patch('/auth/profile', Object.fromEntries(new FormData(event.currentTarget))); updateUser(data.user); setMessage('Your profile has been updated.') }
    catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function password(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    const form = event.currentTarget
    try { await api.patch('/auth/password', Object.fromEntries(new FormData(form))); form.reset(); setMessage('Your password has been updated.') }
    catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <div className="app-shell"><Sidebar active="" onSelect={(tab) => navigate(roleHome[user.role], { state: { tab } })} role={user.role} onSignOut={leaveWorkspace} /><main className="workspace-main"><WorkspaceHeader user={user} onMenu={() => navigate(roleHome[user.role])} onSignOut={leaveWorkspace} /><div className="workspace-content profile-page"><div><div className="eyebrow">YOUR DETAILS, YOURS TO MANAGE</div><h1>Your profile</h1><p>Keep your campus details up to date.</p></div>{message && <p className="success-message">{message}</p>}{error && <p className="inline-error">{error}</p>}<form className="panel form-stack" onSubmit={update}><h2>Profile information</h2><label>Full name<input key={user.name} name="name" defaultValue={user.name} required minLength="2" maxLength="100" /></label><label>University email<input value={user.email} disabled /></label><label>Campus ID<input value={user.universityId} disabled /></label><button disabled={busy} className="button button-dark">Save profile</button></form><form className="panel form-stack" onSubmit={password}><h2>Change password</h2><label>Current password<input name="currentPassword" type="password" required /></label><label>New password<input name="newPassword" type="password" required minLength="8" /></label><button disabled={busy} className="button button-outline">Update password</button></form></div></main></div>
}

function NotificationsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function leaveWorkspace() { signOut() }
  async function load() {
    try { const { data } = await api.get('/notifications'); setNotifications(data.notifications); setError(''); signalNotificationUpdate() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  async function markAll() {
    setBusy(true)
    try { await api.patch('/notifications/read-all'); await load() }
    catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function markRead(id) {
    try { await api.patch(`/notifications/${id}/read`); await load() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  useEffect(() => { load() }, [])
  return <div className="app-shell"><Sidebar active="updates" onSelect={(tab) => navigate(roleHome[user.role], { state: { tab } })} role={user.role} onSignOut={leaveWorkspace} /><main className="workspace-main"><WorkspaceHeader user={user} onMenu={() => navigate(roleHome[user.role])} onSignOut={leaveWorkspace} /><div className="workspace-content"><div className="workspace-title-row"><div><div className="eyebrow">A LITTLE SOMETHING TO KNOW</div><h1>Your updates</h1><p>Report reviews, claim decisions and handover notes.</p></div><button disabled={busy} className="button button-outline" onClick={markAll}><CheckCheck size={16} /> Mark all read</button></div>{error && <p className="inline-error">{error}</p>}<div className="panel">{notifications.length ? notifications.map((note) => <div className="notice-row full-notice" key={note._id}><span className={!note.isRead ? 'notice-dot unread' : 'notice-dot'} /><div><strong>{note.title}</strong><p>{note.message}</p><small>{timeAgo(note.createdAt)}</small></div>{!note.isRead && <button className="small-link" onClick={() => markRead(note._id)}>Mark read</button>}</div>) : <EmptyState compact title="Nothing new." description="When something needs your attention, it’ll appear here." />}</div></div></main></div>
}

function Metric({ icon, label, value, note, tone }) {
  return <div className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><small>{note}</small></div></div>
}

function StatusBadge({ children }) {
  const status = children?.toLowerCase().replaceAll(' ', '-')
  return <span className={`status-badge status-${status}`}>{children}</span>
}

function EmptyState({ title, description, action, compact = false }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}><span className="empty-icon"><Sparkles size={21} /></span><h3>{title}</h3><p>{description}</p>{action && <div>{action}</div>}</div>
}

function Modal({ title, onClose, children }) {
  useEffect(() => { function onKey(event) { if (event.key === 'Escape') onClose() } window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>{children}</div></div>
}

function FooterCompact() {
  return <footer className="compact-footer"><Brand /><span>A little more found. A little less lost.</span></footer>
}

function NotFound() {
  return <div className="center-page"><EmptyState title="This path went missing." description="Let’s get you back to where the good things are." action={<Link className="button button-dark" to="/">Back home <ArrowRight size={15} /></Link>} /></div>
}
function LoadingPage({ compact = false }) {
  return <div className={compact ? 'loading-compact' : 'loading-page'}><span className="loading-mark"><Compass size={21} /></span><span>Finding your way…</span></div>
}

function SessionUnavailable({ error, onRetry, onSignOut }) {
  return <div className="center-page"><EmptyState title="We couldn’t verify your session." description={error} action={<div className="quick-report-actions"><button className="button button-outline" onClick={onRetry}>Try again</button><button className="button button-dark" onClick={onSignOut}>Sign out</button></div>} /></div>
}

function roleLabel(role) { return ({ student: 'Campus member', admin: 'Administrator', helpdesk: 'Campus help desk' })[role] || 'Campus member' }
function formatDate(value) {
  if (!value) return 'Date not set'
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function timeAgo(value) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

export default App
