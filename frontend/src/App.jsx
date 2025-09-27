import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BookOpen, Send, Search, ChevronsRight, Inbox, MessageSquare } from 'lucide-react';

// For Vercel deployment, all API calls are relative to the current domain.
// The `vercel.json` file routes any request starting with "/api" to the backend server.
const API_BASE_URL = '/api';

// This should be the email of the currently logged-in user of your platform.
// In a real application, you would get this from your platform's authentication context.
const LOGGED_IN_USER_EMAIL = 'lharris@invoca.com'; 

// Get this from Salesforce Setup -> Web-to-Case
const SALESFORCE_ORG_ID = '00Df40000022MuR'; 

function App() {
  const [activeTab, setActiveTab] = useState('support');
  
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {activeTab === 'support' && <SupportTab />}
        {activeTab === 'cases' && <CasesTab />}
        {activeTab === 'search' && <SearchTab />}
      </main>
      <Footer />
    </div>
  );
}

// --- Main Components (Tabs) ---

const SupportTab = () => {
  // This is the fix: Initialize categories with a safe, empty structure.
  // This prevents the '.map' error even if the API response is unusual.
  const [categories, setCategories] = useState({ topCategories: [] });
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Articles');

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/knowledge/categories`);
        // Validate that the response has the expected structure.
        if (response.data && Array.isArray(response.data.topCategories)) {
          setCategories(response.data);
        } else {
          // This will happen if the backend sends an error or unexpected data.
          throw new Error("Invalid data structure for categories received from the server.");
        }
      } catch (err) {
        setError('Could not load article categories. The backend API might be misconfigured or returning an error.');
        console.error("Error details:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const handleCategorySelect = useCallback(async (category) => {
    setSelectedArticle(null);
    setArticles([]);
    setIsLoading(true);
    setSelectedCategory(category.label);
    try {
      const response = await axios.get(`${API_BASE_URL}/knowledge/articles/${category.name}`);
      // Add validation to ensure articles are always an array.
      setArticles(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(`Could not load articles for ${category.label}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleArticleSelect = useCallback(async (articleUrlName) => {
    setIsLoading(true);
    setSelectedArticle(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/knowledge/article/${articleUrlName}`);
      setSelectedArticle(response.data);
    } catch (err) {
      setError(`Could not load article.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (error) return <ErrorMessage message={error} />;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside className="lg:col-span-1 bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-bold mb-4 flex items-center"><BookOpen className="mr-2 h-5 w-5 text-sky-600"/> Categories</h2>
        {isLoading ? <Spinner/> : <CategoryTree tree={categories} onSelect={handleCategorySelect} />}
      </aside>

      <div className="lg:col-span-3">
        {selectedArticle ? (
          <ArticleDetail article={selectedArticle} onBack={() => setSelectedArticle(null)} />
        ) : (
          <ArticleList 
            articles={articles} 
            onSelect={handleArticleSelect} 
            isLoading={isLoading} 
            category={selectedCategory}
          />
        )}
      </div>
    </div>
  );
};

const CasesTab = () => {
  const [subView, setSubView] = useState('list'); // 'list' or 'new'

  return (
    <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm">
      <div className="flex border-b mb-6">
        <button onClick={() => setSubView('list')} className={`px-4 py-2 text-lg font-semibold ${subView === 'list' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500'}`}>My Open Cases</button>
        <button onClick={() => setSubView('new')} className={`px-4 py-2 text-lg font-semibold ${subView === 'new' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500'}`}>Submit a New Case</button>
      </div>
      {subView === 'list' ? <CaseList /> : <NewCaseForm />}
    </div>
  );
};

const SearchTab = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        
        setIsLoading(true);
        setError('');
        setResults(null);
        try {
            const response = await axios.post(`${API_BASE_URL}/search`, { searchTerm });
            setResults(response.data);
        } catch (err) {
            setError('An error occurred during the search. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm">
            <h2 className="text-2xl font-bold mb-4 flex items-center"><Search className="mr-2 h-6 w-6 text-sky-600"/> Search Knowledge Base</h2>
            <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Ask a question or search for keywords..."
                    className="flex-grow p-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <button type="submit" disabled={isLoading} className="bg-sky-600 text-white font-semibold px-6 py-3 rounded-md hover:bg-sky-700 disabled:bg-slate-400 flex items-center">
                    {isLoading ? <Spinner size="sm" /> : <Search className="h-5 w-5"/>}
                    <span className="ml-2">Search</span>
                </button>
            </form>

            {isLoading && <div className="flex justify-center p-8"><Spinner /></div>}
            {error && <ErrorMessage message={error} />}
            {results && (
                <div>
                    <div className="bg-sky-50 border-l-4 border-sky-500 p-6 rounded-r-lg mb-6">
                        <h3 className="text-lg font-semibold text-sky-800 mb-2">Answer from Gemini</h3>
                        <p className="text-slate-700 whitespace-pre-wrap">{results.answer}</p>
                    </div>
                    
                    <h3 className="text-xl font-semibold mb-4">Sources</h3>
                    {results.sources && results.sources.length > 0 ? (
                        <ul className="space-y-3">
                            {results.sources.map(source => (
                                <li key={source.Id} className="bg-slate-50 p-4 rounded-md border border-slate-200">
                                   <p className="font-semibold text-sky-700">{source.Title}</p>
                                   <p className="text-sm text-slate-600">{source.Summary}</p>
                                </li>
                            ))}
                        </ul>
                    ) : <p>No direct sources were found for this answer.</p>}
                </div>
            )}
        </div>
    );
};


// --- Sub Components ---

const Header = ({ activeTab, setActiveTab }) => (
  <header className="bg-white shadow-md">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center py-4">
        <div className="text-2xl font-bold text-slate-800">
          <span className="text-sky-600">Support</span> Portal
        </div>
        <nav className="flex space-x-2 sm:space-x-4">
          <TabButton name="support" activeTab={activeTab} setActiveTab={setActiveTab} icon={<BookOpen />} />
          <TabButton name="cases" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Inbox />} />
          <TabButton name="search" activeTab={activeTab} setActiveTab={setActiveTab} icon={<Search />} />
        </nav>
      </div>
    </div>
  </header>
);

const TabButton = ({ name, activeTab, setActiveTab, icon }) => (
  <button
    onClick={() => setActiveTab(name)}
    className={`px-3 py-2 text-sm sm:text-base font-medium rounded-md flex items-center transition-colors duration-200 ${
      activeTab === name
        ? 'bg-sky-100 text-sky-700'
        : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    {React.cloneElement(icon, { className: "h-5 w-5 mr-2"})}
    <span className="capitalize">{name}</span>
  </button>
);

const CategoryTree = ({ tree, onSelect }) => {
    // This component is now safe because the `tree` prop is guaranteed to have `topCategories`.
    if (!tree.topCategories || tree.topCategories.length === 0) {
        return <p className="text-slate-500">No categories found.</p>
    }

    return (
      <ul>
        {tree.topCategories.map(category => (
          <li key={category.name} className="my-1">
            <button onClick={() => onSelect(category)} className="font-semibold text-slate-700 hover:text-sky-600 flex items-center text-left">
              <ChevronsRight className="h-4 w-4 mr-1 flex-shrink-0" /> {category.label}
            </button>
            {category.childCategories && category.childCategories.length > 0 && (
              <ul className="pl-5 mt-1 border-l-2 border-slate-200">
                {category.childCategories.map(child => (
                  <li key={child.name} className="my-1">
                    <button onClick={() => onSelect(child)} className="text-slate-600 hover:text-sky-600">{child.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
};

const ArticleList = ({ articles, onSelect, isLoading, category }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold mb-4">{category}</h2>
        {isLoading ? <div className="flex justify-center p-8"><Spinner /></div> : 
            articles.length > 0 ? (
                <ul className="space-y-4">
                    {articles.map(article => (
                        <li key={article.Id} className="border-b border-slate-200 pb-4">
                           <button onClick={() => onSelect(article.UrlName)} className="text-left w-full group">
                                <h3 className="text-xl font-semibold text-sky-700 group-hover:underline">{article.Title}</h3>
                                <p className="text-slate-600 mt-1">{article.Summary}</p>
                           </button>
                        </li>
                    ))}
                </ul>
            ) : <p>No articles found in this category.</p>
        }
    </div>
);

const ArticleDetail = ({ article, onBack }) => (
    <div className="bg-white p-8 rounded-lg shadow-sm">
        <button onClick={onBack} className="mb-6 text-sky-600 hover:text-sky-800 font-semibold">&larr; Back to list</button>
        <h1 className="text-4xl font-bold mb-4">{article.Title}</h1>
        <p className="text-lg text-slate-600 italic mb-6">{article.Summary}</p>
        <div 
            className="prose max-w-none" 
            dangerouslySetInnerHTML={{ __html: article.Article_Content__c }} 
        />
    </div>
);


const CaseList = () => {
    const [cases, setCases] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchCases = async () => {
            if (!LOGGED_IN_USER_EMAIL.includes('@')) {
                setError('A valid customer email is required to fetch cases. Please update the placeholder in App.jsx.');
                setIsLoading(false);
                return;
            }
            try {
                const response = await axios.get(`${API_BASE_URL}/cases/${LOGGED_IN_USER_EMAIL}`);
                // Add validation to ensure cases are always an array.
                setCases(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                setError('Could not load your open cases.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCases();
    }, []);

    if (isLoading) return <div className="flex justify-center p-8"><Spinner /></div>
    if (error) return <ErrorMessage message={error} />
    
    return (
      <div>
        {cases.length > 0 ? (
          <ul className="space-y-6">
            {cases.map(c => <CaseItem key={c.Id} caseData={c} />)}
          </ul>
        ) : <p>You have no open cases.</p>}
      </div>
    );
};

const CaseItem = ({ caseData }) => {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setIsReplying(true);
    try {
      await axios.post(`${API_BASE_URL}/cases/${caseData.Id}/reply`, {
        commentBody: replyText,
        isPublic: true,
      });
      setReplyText('');
      setShowReply(false);
      // Ideally, you'd show a success message or refresh comments
    } catch (error) {
      console.error("Failed to post reply", error);
      // Show an error message to the user
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <li className="bg-slate-50 p-5 rounded-lg border border-slate-200">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs text-slate-500">{caseData.CaseNumber}</p>
          <h3 className="text-xl font-semibold">{caseData.Subject}</h3>
        </div>
        <span className="text-sm font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{caseData.Status}</span>
      </div>
      <p className="text-slate-600 mt-2">{caseData.Description}</p>
      <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
         <p className="text-xs text-slate-500">Opened: {new Date(caseData.CreatedDate).toLocaleDateString()}</p>
         <button onClick={() => setShowReply(!showReply)} className="text-sky-600 font-semibold flex items-center text-sm">
            <MessageSquare className="h-4 w-4 mr-1" />
            {showReply ? 'Cancel' : 'Reply'}
          </button>
      </div>
      {showReply && (
        <form onSubmit={handleReply} className="mt-4">
          <textarea 
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows="3" 
            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500"
            placeholder="Type your reply..."></textarea>
          <button type="submit" disabled={isReplying} className="mt-2 bg-sky-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-sky-700 disabled:bg-slate-400">
            {isReplying ? 'Sending...' : 'Send Reply'}
          </button>
        </form>
      )}
    </li>
  )
};

const NewCaseForm = () => (
    <div>
        <h2 className="text-2xl font-bold mb-1 text-slate-800">Submit a New Support Case</h2>
        <p className="mb-6 text-slate-500">Please provide as much detail as possible. Our team will get back to you shortly.</p>
        
        {/* This form submits directly to Salesforce */}
        <form action="https://webto.salesforce.com/servlet/servlet.WebToCase?encoding=UTF-8" method="POST" className="space-y-4">
            
            <input type="hidden" name="orgid" value={SALESFORCE_ORG_ID} />
            {/* You might have a success/error page to redirect to */}
            <input type="hidden" name="retURL" value={window.location.href} /> 
            
            <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700">Your Name</label>
                <input type="text" id="name" name="name" required className="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" />
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">Your Email</label>
                <input type="email" id="email" name="email" defaultValue={LOGGED_IN_USER_EMAIL} required className="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-100" />
            </div>

            <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-700">Subject</label>
                <input type="text" id="subject" name="subject" required className="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" />
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700">Description</label>
                <textarea id="description" name="description" rows="6" required className="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500"></textarea>
            </div>

            <div className="flex justify-end">
                <button type="submit" className="bg-sky-600 text-white font-semibold px-6 py-3 rounded-md hover:bg-sky-700 flex items-center">
                    <Send className="h-5 w-5 mr-2" />
                    Submit Case
                </button>
            </div>
        </form>
    </div>
);

const Footer = () => (
  <footer className="text-center py-6 text-slate-500 text-sm">
      <p>&copy; {new Date().getFullYear()} Your Company. All rights reserved.</p>
  </footer>
);

const Spinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  return (
    <div className={`animate-spin rounded-full border-4 border-t-sky-500 border-slate-200 ${sizeClasses[size]}`}></div>
  );
};

const ErrorMessage = ({ message }) => (
  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
    <p className="font-bold">Error</p>
    <p>{message}</p>
  </div>
);

// Triggering a fresh Vercel deployment
export default App;

