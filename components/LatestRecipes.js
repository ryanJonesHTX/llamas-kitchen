import Link from 'next/link'

const products = [
  {
    id: 1,
    name: 'Leather Long Wallet',
    color: 'Natural',
    price: '$75',
    href: '#',
    imageSrc:
      'https://tailwindui.com/img/ecommerce-images/home-page-04-trending-product-02.jpg',
    imageAlt: 'Hand stitched, orange leather long wallet.',
  },
  // More products...
]

export default function Recipecard({ recipes }) {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-2xl py-16 px-4 sm:py-24 sm:px-6 lg:max-w-7xl lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Latest Recipes
          </h2>
          <Link
            href="/recipes"
            className="hidden text-sm font-medium text-indigo-600 hover:text-indigo-500 md:block"
          >
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-4 md:gap-y-0 lg:gap-x-8">
          {recipes.map((recipe) => (
            <div key={recipe._id} className="group relative">
              <div className="h-56 w-full overflow-hidden rounded-md bg-gray-200 group-hover:opacity-75 lg:h-72 xl:h-80">
                <img
                  src={recipe.photo}
                  alt={recipe.name}
                  className="h-full w-full object-cover object-center"
                />
              </div>
              <h3 className="mt-4 text-sm text-gray-700">
              <Link href="/[id]" as={`/${recipe._id}`}>
                  <span className="absolute inset-0" />
                  {recipe.name}
                </Link>
              </h3>
            </div>
          ))}
        </div>

        <div className="mt-8 text-sm md:hidden">
          <a
            href="#"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            See all Recipes
            <span aria-hidden="true"> &rarr;</span>
          </a>
        </div>
      </div>
    </div>
  )
}

//     {/* Create a card for each pet */}
//    {pets.map((pet) => (
//       <div key={pet._id}>
//         <div className="card">
//           <img src={pet.image_url} />
//           <h5 className="pet-name">{pet.name}</h5>
//           <div className="main-content">
//             <p className="pet-name">{pet.name}</p>
//             <p className="owner">Owner: {pet.owner_name}</p>

//             {/* Extra Pet Info: Likes and Dislikes */}
//             <div className="likes info">
//               <p className="label">Likes</p>
//               <ul>
//                 {pet.likes.map((data, index) => (
//                   <li key={index}>{data} </li>
//                 ))}
//               </ul>
//             </div>
//             <div className="dislikes info">
//               <p className="label">Dislikes</p>
//               <ul>
//                 {pet.dislikes.map((data, index) => (
//                   <li key={index}>{data} </li>
//                 ))}
//               </ul>
//             </div>

//             <div className="btn-container">
//               <Link href="/[id]/edit" as={`/${pet._id}/edit`} legacyBehavior>
//                 <button className="btn edit">Edit</button>
//               </Link>
//               <Link href="/[id]" as={`/${pet._id}`} legacyBehavior>
//                 <button className="btn view">View</button>
//               </Link>
//             </div>
//           </div>
//         </div>
//       </div>
//     ))}
//   </>
