import Link from 'next/link'
import { useState } from 'react'
import MyCombobox from './MyCombobox'
import { Dialog } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Recipes', href: '/recipes' },
  { name: 'Add Recipe', href: '/new' },
]

export default function Landing({ recipes }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="relative bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="relative z-10 lg:w-full lg:h-full lg:max-w-2xl">
          <svg
            className="absolute inset-y-0 right-8 hidden h-full w-80 translate-x-1/2 transform fill-white lg:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon points="0,0 90,0 50,100 0,100" />
          </svg>

          <div className="relative px-6 pt-6 lg:pl-8 lg:pr-0">
            <nav
              className="flex items-center justify-between sm:h-10 lg:justify-start"
              aria-label="Global"
            >
              <Link href="/" className="-m-1.5 p-1.5">
                <span className="sr-only">Llama's Kitchen</span>
                <img
                  alt="Llama's Kitchen"
                  className="h-12 w-auto"
                  src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676184096/llama-icon_wdbpep.webp"
                />
              </Link>
              <button
                type="button"
                className="-m-2.5 rounded-md p-2.5 text-gray-700 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <span className="sr-only">Open main menu</span>
                <Bars3Icon className="h-6 w-6" aria-hidden="true" />
              </button>
              <div className="hidden lg:ml-12 lg:block lg:space-x-14">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="text-sm font-semibold leading-6 text-gray-900"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="hidden lg:flex lg:flex-1 justify-center px-2 lg:ml-12 lg:justify-end">
                {/* <div className="w-full max-w-lg lg:max-w-xs">
                  <label htmlFor="search" className="sr-only">
                    Search
                  </label>
                  <div className="relative text-gray-400 focus-within:text-gray-600">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <MagnifyingGlassIcon
                        className="h-5 w-5"
                        aria-hidden="true"
                      />
                    </div>
                    <input
                      id="search"
                      className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 leading-5 text-gray-900 placeholder-gray-500 focus:border-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600 sm:text-sm"
                      placeholder="Search"
                      type="search"
                      name="search"
                    />
                  </div>
                </div> */}
                <MyCombobox recipes={recipes} />
              </div>
            </nav>
            <Dialog as="div" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
              <Dialog.Panel className="fixed inset-0 z-10 overflow-y-auto bg-white px-6 py-6 lg:hidden">
                <div className="flex flex-row-reverse items-center justify-between">
                  <button
                    type="button"
                    className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="sr-only">Close menu</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <Link href="/" className="-m-1.5 p-1.5">
                    <span className="sr-only">Llama's Kitchen</span>
                    <img
                      className="h-12"
                      src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676184096/llama-icon_wdbpep.webp"
                      alt="Llama's Kitchen"
                    />
                  </Link>
                </div>
                <div className="mt-6 space-y-2">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="-mx-3 block rounded-lg py-2 px-3 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-400/10"
                    >
                      {item.name}
                    </Link>
                  ))}
                  <div className="flex flex-1 justify-center px-2 lg:ml-6 lg:justify-end">
                  <MyCombobox recipes={recipes} />
                    {/* <div className="w-full max-w-lg lg:max-w-xs">
                      <label htmlFor="search" className="sr-only">
                        Search
                      </label>
                      <div className="relative text-gray-400 focus-within:text-gray-600">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <MagnifyingGlassIcon
                            className="h-5 w-5"
                            aria-hidden="true"
                          />
                        </div>
                        <input
                          id="search"
                          className="block w-full rounded-md border border-transparent bg-white py-2 pl-10 pr-3 leading-5 text-gray-900 placeholder-gray-500 focus:border-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600 sm:text-sm"
                          placeholder="Search"
                          type="search"
                          name="search"
                        />
                      </div>
                    </div> */}
                  </div>
                </div>
              </Dialog.Panel>
            </Dialog>
          </div>

          <div className="relative py-32 px-6 sm:py-40 lg:py-56 lg:px-8 lg:pr-0">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Llama's Kitchen
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                A collection of recipes acquired from friends, family and
                discovered as we go along! Please feel free to add your personal favorites for us to try.
              </p>
              <div className="mt-10 flex items-center gap-x-6">
                <Link
                  href="/recipes"
                  className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-base font-semibold leading-7 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  All Recipes
                </Link>
                <Link
                  href="/new"
                  className="text-base font-semibold leading-7 text-gray-900"
                >
                  Add Recipe <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
        <img
          className="aspect-[4/3] object-cover lg:aspect-auto lg:h-full lg:w-full"
          src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676182454/llama_rmoylj.webp"
          alt="Llama's Kitchen"
        />
      </div>
    </div>
  )
}
