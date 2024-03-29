import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import MyCombobox from './MyCombobox'

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Recipes', href: '/recipes' },
  { name: 'Add Recipe', href: '/new' },
]

export default function Nav({ recipes }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="relative px-6 pt-6 lg:pl-8 lg:pr-0">
      <div className="mx-auto max-w-7xl">
        <div className="lg:w-full">
          <nav
            className="flex items-center justify-between sm:h-10 lg:justify-start"
            aria-label="Global"
          >
            <Link
              href="/"
              className="-m-1.5 p-1.5"
            >
              <span className="sr-only">Llama's Kitchen</span>
              <Image
                alt="Llama's Kitchen"
                className="h-12 w-auto"
                src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676184096/llama-icon_wdbpep.webp"
                width={48}
                height={48}
              />
            </Link>
            <h3 className="-ml-3 text-xl font-bold leading-6 text-gray-900 lg:hidden">
              Llama's Kitchen
            </h3>
            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-gray-700 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon
                className="h-6 w-6"
                aria-hidden="true"
              />
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
            <div className="hidden lg:flex lg:mr-8 lg:ml-auto">
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
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 leading-5 text-gray-900 placeholder-gray-500 focus:border-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600 sm:text-sm"
                    placeholder="Search"
                    type="search"
                    name="search"
                  />
                </div>
              </div> */}
            </div>
          </nav>
          <Dialog
            as="div"
            open={mobileMenuOpen}
            onClose={setMobileMenuOpen}
          >
            <Dialog.Panel className="fixed inset-0 z-10 overflow-y-auto bg-white px-6 py-6 lg:hidden">
              <div className="flex flex-row-reverse items-center justify-between">
                <button
                  type="button"
                  className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="sr-only">Close menu</span>
                  <XMarkIcon
                    className="h-6 w-6"
                    aria-hidden="true"
                  />
                </button>
                <Link
                  href="/"
                  className="-m-1.5 p-1.5"
                >
                  <span className="sr-only">Llama's Kitchen</span>
                  <Image
                    className="h-12"
                    src="https://res.cloudinary.com/dhcbfbegu/image/upload/v1676184096/llama-icon_wdbpep.webp"
                    alt="Llama's Kitchen"
                    width={42}
                    height={42}
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
                <div className="flex flex-1 px-2 lg:hidden">
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
      </div>
    </div>
  )
}
