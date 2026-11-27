require('dotenv').config();
const { User, Farm, Category, Product, Order, Order_Items, Address } = require('./src/models');

const GRODNO_DISTRICTS = ['Девятовка', 'Ольшанка', 'Вишневец', 'Центр', 'Фолюш', 'Грандичи'];

async function populateAllFarmers() {
  try {
    console.log(' Начинаем наполнение аналитики для всех фермеров...');

    // 1. Находим всех одобренных фермеров
    const farms = await Farm.findAll({ where: { status: 'approved' } });
    if (!farms.length) {
      console.error(' Ошибка: Нет ферм со статусом approved!');
      return;
    }

    // 2. Находим или создаем клиента
    let clientUser = await User.findOne({ where: { role: 'client' } });
    if (!clientUser) {
      clientUser = await User.create({
        email: 'test_client_auto@delfarm.by',
        password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
        full_name: 'Алексей Клиентов',
        phone_number: '+375291112233',
        role: 'client'
      });
    }

    // 3. Создаем адреса во всех районах Гродно
    const addresses = [];
    for (const d of GRODNO_DISTRICTS) {
      const addr = await Address.create({
        user_id: clientUser.user_id,
        address_line: `г. Гродно, ул. Тестовая (${d})`,
        district: d
      });
      addresses.push(addr);
    }

    // 4. Наполняем каждую ферму
    for (const farm of farms) {
      console.log(`\n Обработка фермы: "${farm.farm_name}" (ID: ${farm.farm_id})...`);

      // Получаем или создаем товары для фермы
      let products = await Product.findAll({ where: { farm_id: farm.farm_id } });
      
      // Если товаров мало, создадим базовый ассортимент
      if (products.length < 3) {
        const cat = await Category.findOne() || await Category.create({ name: 'Фермерские продукты' });
        const p1 = await Product.create({
          farm_id: farm.farm_id,
          category_id: cat.category_id,
          name: 'Творог Домашний 9%',
          price: 9.60,
          unit: 'кг',
          stock_quantity: 4, // Сразу критический остаток для алерта!
          image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150'
        });
        const p2 = await Product.create({
          farm_id: farm.farm_id,
          category_id: cat.category_id,
          name: 'Сыр "Городенский Крафт"',
          price: 32.00,
          unit: 'кг',
          stock_quantity: 18,
          image_url: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d'
        });
        const p3 = await Product.create({
          farm_id: farm.farm_id,
          category_id: cat.category_id,
          name: 'Свежее молоко цельное',
          price: 3.50,
          unit: 'л',
          stock_quantity: 2, // Тоже критический остаток!
          image_url: 'https://images.unsplash.com/photo-1528750997573-59b89d56f4f7'
        });
        products = [p1, p2, p3];
      } else {
        // Убедимся, что хотя бы у одного-двух товаров остаток <= 5 для блока Stock Alerts
        products[0].stock_quantity = 3;
        await products[0].save();
        if (products[1]) {
          products[1].stock_quantity = 5;
          await products[1].save();
        }
      }

      // Генерируем 35-40 заказов за последние 30 дней
      const now = new Date();
      for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
        const orderDate = new Date();
        orderDate.setDate(now.getDate() - dayOffset);

        // По пятницам и субботам заказов больше (имитация реального спроса)
        const isPeak = orderDate.getDay() === 5 || orderDate.getDay() === 6;
        const dailyOrders = isPeak ? 3 : (dayOffset % 2 === 0 ? 2 : 1);

        for (let i = 0; i < dailyOrders; i++) {
          const randomAddr = addresses[Math.floor(Math.random() * addresses.length)];
          
          const order = await Order.create({
            user_id: clientUser.user_id,
            address_id: randomAddr.address_id,
            status: 'delivered', // Обязательно delivered, чтобы попало во View
            total_price: 0,
            payment_method: 'card',
            created_at: orderDate
          });

          // Товар А (Флагман - 75% выручки)
          const qty1 = Math.floor(Math.random() * 3) + 2;
          const rev1 = Number(products[0].price) * qty1;
          await Order_Items.create({
            order_id: order.order_id,
            product_id: products[0].product_id,
            quantity: qty1,
            price_per_unit: products[0].price
          });

          let orderSum = rev1;

          // Товар Б или С (дополнительный)
          if (products.length > 1 && Math.random() > 0.3) {
            const prod2 = products[Math.floor(Math.random() * (products.length - 1)) + 1];
            const qty2 = 1;
            const rev2 = Number(prod2.price) * qty2;
            await Order_Items.create({
              order_id: order.order_id,
              product_id: prod2.product_id,
              quantity: qty2,
              price_per_unit: prod2.price
            });
            orderSum += rev2;
          }

          order.total_price = orderSum;
          await order.save();
        }
      }
      console.log(`   Готово: созданы заказы и остатки для фермы "${farm.farm_name}"`);
    }

    console.log('\n ВСЯ АНАЛИТИКА УСПЕШНО НАПОЛНЕНА!');
    process.exit(0);
  } catch (err) {
    console.error('Ошибка:', err);
    process.exit(1);
  }
}

populateAllFarmers();