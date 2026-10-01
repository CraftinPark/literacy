export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">L</span>
          </div>
          <span className="text-xl font-bold text-white">Literacy</span>
        </div>
        <div className="flex gap-4">
          <button className="px-6 py-2 text-gray-300 font-medium hover:text-white">
            Sign In
          </button>
          <button className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center space-y-6 mb-20">
          <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
            Become Code <span className="text-blue-400">Fluent</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            AI is solving the easy part—outputting code. The irreplaceable part is understanding it, 
            evaluating it, and deciding if it's right. As AI floods your PRs with suggestions, 
            the ability to review critically will make you invaluable.
          </p>
        </div>

        {/* Sample Problem Preview */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-20 overflow-hidden">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Example: Pointers & Memory</h2>
            <p className="text-gray-400">Read the code below. What does it do?</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Code Area */}
            <div className="bg-gray-950 rounded-lg p-6 font-mono text-sm border border-gray-800">
              <div className="text-gray-500 mb-4">
                <div><span className="text-blue-400">int</span> <span className="text-yellow-300">swap</span>(<span className="text-blue-400">int</span> *a, <span className="text-blue-400">int</span> *b) {`{`}</div>
                <div className="ml-4"><span className="text-blue-400">int</span> temp = *a;</div>
                <div className="ml-4">*a = *b;</div>
                <div className="ml-4">*b = temp;</div>
                <div>{`}`}</div>
              </div>
            </div>

            {/* Explanation Area */}
            <div className="space-y-4">
              <p className="text-gray-300">Try explaining what this function does and how it works with pointers.</p>
              <textarea 
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Explain the purpose and mechanism of this code..."
                rows={6}
              />
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition">
                Evaluate
              </button>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Ready?</h2>
            <p className="text-gray-400">Start with free practice problems. No credit card required.</p>
          </div>
          <div className="flex gap-4 justify-center">
            <button className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">
              Start Learning
            </button>
            <button className="px-8 py-3 border border-gray-700 text-gray-300 font-semibold rounded-lg hover:border-gray-600 hover:bg-gray-900 transition">
              Sign In
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 border-t border-gray-800 py-12 mt-24">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p>© 2026 Literacy</p>
        </div>
      </div>
    </div>
  );
}
