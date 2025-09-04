'use client'

import { useState } from 'react'
import Link from 'next/link'

interface FAQItem {
  question: string
  answer: string
  isOpen: boolean
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([
    {
      question: 'How do I create an account?',
      answer: 'To create an account, click on the "Sign Up" button in the top right corner of the page. Fill in your details and follow the instructions to complete the registration process.',
      isOpen: false
    },
    {
      question: 'How can I reset my password?',
      answer: 'If you forgot your password, click on the "Sign in" button and then select "Forgot password?". Enter your email address and follow the instructions sent to your email to reset your password.',
      isOpen: false
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We currently accept credit cards and Apple Pay for all purchases. These payment methods provide secure and convenient transactions for our users.',
      isOpen: false
    },
    {
      question: 'How can I contact customer support?',
      answer: 'For customer support, please email us at support@zapull.fun. Our team will respond to your inquiries as soon as possible.',
      isOpen: false
    },
    {
      question: 'What is fusion?',
      answer: 'Fusion lets you combine different cards to create new, unique cards. You can find it under the Fusion tab in the app. Visit the Fusion page to learn more about how it works.',
      isOpen: false
    }
  ])

  const toggleFAQ = (index: number) => {
    setFaqs(faqs.map((faq, i) => {
      if (i === index) {
        return { ...faq, isOpen: !faq.isOpen }
      }
      return faq
    }))
  }

  return (
    <div className="max-w-3xl mx-auto text-white">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-400">Find answers to the most common questions about our platform.</p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-[#1E2142] rounded-lg overflow-hidden">
            <button
              className="w-full text-left p-4 flex justify-between items-center focus:outline-none"
              onClick={() => toggleFAQ(index)}
            >
              <span className="font-medium">{faq.question}</span>
              <svg
                className={`w-5 h-5 transition-transform ${faq.isOpen ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {faq.isOpen && (
              <div className="p-4 pt-0 text-gray-300 text-sm">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-gray-400 mb-4">Still have questions?</p>
        <Link 
          href="/support" 
          className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-2 px-6 rounded-md inline-block transition-colors"
        >
          Contact Support
        </Link>
      </div>
    </div>
  )
}
