const express = require('express')
const cors = require('cors')
var jwt = require('jsonwebtoken')
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const stripe = require('stripe')(
  'sk_test_51M6whnJG3RT8PjQ3CfCIN6K1XR8HarKnmLSpzxI4vGCR1R2QueUA4uu1B6Xa0S7fRcGKSCpMuZRhrZ5Glp0ldHoI002SISFEmQ',
)

const app = express()

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lcft2gb.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

function verifyJET(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).send('unauthorize access')
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: 'forbiden access' })
    }
    req.decoded = decoded
    next()
  })
}

async function run() {
  try {
    const appoinmentOption = client.db('doctor-portal').collection('service')
    const bookingCollection = client.db('doctor-portal').collection('booking')
    const userCollection = client.db('doctor-portal').collection('user')
    const doctorCollection = client.db('doctor-portal').collection('doctor')
    const paymentCollection = client.db('doctor-portal').collection('payment')


    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email
      const query = { email: decodedEmail }
      const user = await userCollection.findOne(query)

      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }

      next()
    }

    //=====jwt====

    app.get('/jwt', async (req, res) => {
      const email = req.query.email
      console.log(email)
      const query = { email: email }
      const user = await userCollection.findOne(query)
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: '1h',
        })
        return res.send({ accessToken: token })
      }
      res.status(401).send('Unauthorize access')
    })




    // Use Agreegate to query multiple collection and then merge data
    app.get('/service', async (req, res) => {
      const query = {}
      const result = await appoinmentOption.find(query).toArray()

      // date ta ui theke api er maddome query diye pathano hoyece
      const date = req.query.date

      //appoinmentDate holo User je booking korce oi booking object gular ek ta option
      const bookingQuery = { appoinmentDate: date }
      //vibinno diner booking collection thakte pare..akhon amra khujcci booking collectioner vitor spacific dater kono collection ase kina ..thakle puro object ta dw
      const alreadyBooked = await bookingCollection.find(bookingQuery).toArray()

      result.forEach((option) => {
        //book kora item gula array akare pawoar por ..oi item gular name er sathe jodi main data (result) er data gular nam mile tahole ek ta var rakhci
        //book korar smy main datar name(roger nam) ke treatmet hisebe pahaici
        const optionBooked = alreadyBooked.filter(
          (currentbooking) => currentbooking.treatment === option.name,
        )

        //akhon book kora item jehetu slot(Appoinment time) ase..to slot gula k map kore slot(time) gula ke amra array akare pelam
        const bookedSlots = optionBooked.map((currentBook) => currentBook.slot)

        //booking theke je slot gula peyeci ..oi gula bade baki gula main api te duklam
        const remaningSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot),
        )
        option.slots = remaningSlots
      })
      res.send(result)
    })

    // =====Booking data=====
    app.post('/booking', async (req, res) => {
      const booking = req.body

      //akhane appoinment date, email ta ager booking kora item gula theke newoa ...to ager booking item er sathe
      //jodi notun booing item mile tahole amra booking korte divo nh
      const query = {
        appoinmentDate: booking.appoinmentDate,
        email: booking.email,
        treatment: booking.treatment,
      }

      const alreadyBooked = await bookingCollection.find(query).toArray()
      if (alreadyBooked.length) {
        const message = `You have already booked on ${booking.appoinment}`
        return res.send({ acknowledged: false, message })
      }

      const result = await bookingCollection.insertOne(booking)
      res.send(result)
    })



    app.get('/booking', verifyJET, verifyAdmin, async (req, res) => {
      
      const email = req.query.email
      const decodedEmail = req.decoded.email
      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/user', async (req, res) => {
      const user = req.body
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.get('/user', async (req, res) => {
      const query = {}
      const allUser = await userCollection.find(query).toArray()
      res.send(allUser)
    })

    app.put('/user/admin/:id', verifyJET, async (req, res) => {
      const id = req.params.id
      const filter = { _id: ObjectId(id) }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          role: 'admin',
        },
      }
      const result = await userCollection.updateOne(filter, updateDoc, options)
      res.send(result)
    })

    // //temporati code for updet data
    // app.get('/addPrice', async (req, res) => {
    //   const filter = {}
    //   const option = {upsert : true}
    //   const updateDoc = {
    //     $set:{
    //       price: 99
    //     }
    //   }
    //   const result = await appoinmentOption.updateMany(filter, updateDoc, option)
    //   res.send(result)
    // })

    app.get('/user/admin/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await userCollection.findOne(query)
      res.send({ isAdmin: user?.role === 'admin' })
    })

    app.get('/appoinmentspecilty', async (req, res) => {
      const query = {}
      const result = await appoinmentOption
        .find(query)
        .project({ name: 1 })
        .toArray()
      res.send(result)
    })

    app.post('/doctors', async (req, res) => {
      const doctor = req.body
      console.log(doctor)
      const result = await doctorCollection.insertOne(doctor)
      res.send(result)
    })

    app.get('/doctors', async (req, res) => {
      const query = {}
      const result = await doctorCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/doctors/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await doctorCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: ObjectId(id) }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    // stripe api here

    app.post('/create-payment-intent', async (req, res) => {
      const booking = req.body
      const price = booking.price
      const amount = price * 100

      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        payment_method_types: ['card'],
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })


    app.post('/payments', async(req, res) =>{
      const payment = req.body
      const result = await paymentCollection.insertOne(payment)
      // agreegat
      const id = payment.bookingId
      const filter = {_id: ObjectId(id)}
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const updateResult = await bookingCollection.updateOne(filter, updateDoc)
      res.send(result)
    })


    
  } finally {
  }
}

run().catch((err) => console.log(err))

app.get('/', async (req, res) => {
  res.send('server is running')
})

app.listen(port, () => {
  console.log(`dentist server is running on port ${port}`)
})
