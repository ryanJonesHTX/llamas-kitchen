

// export async function getServerSideProps({ params }) {
//   await dbConnect()

//   let recipe = await Recipe.findById(params.searchTerm).lean()
//   recipe._id = recipe._id.toString()
//   recipe = JSON.parse(JSON.stringify(recipe))

//   return { props: { recipe } }
// }