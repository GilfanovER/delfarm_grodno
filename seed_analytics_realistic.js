require('dotenv').config();
const { sequelize, User, Farm, Category, Product, Order, Order_Items, Address } = require('./src/models');

const GRODNO_DISTRICTS = ['Девятовка', 'Ольшанка', 'Вишневец', 'Центр', 'Фолюш', 'Грандичи'];

const REAL_CLIENTS = [
  { name: 'Алексей Клиентов', email: 'alex_grodno@gmail.com', phone: '+375291112233' },
  { name: 'Елена Ковальчук', email: 'elena_koval@tut.by', phone: '+375292223344' },
  { name: 'Дмитрий Соколов', email: 'dmitry_sokol@mail.ru', phone: '+375293334455' },
  { name: 'Ольга Богданович', email: 'olga_bogdan@gmail.com', phone: '+375294445566' },
  { name: 'Максим Дубровский', email: 'max_dubr@yandex.by', phone: '+375295556677' },
  { name: 'Татьяна Савицкая', email: 'tatyana_sav@tut.by', phone: '+375296667788' },
  { name: 'Сергей Морозов', email: 'sergey_moroz@mail.ru', phone: '+375297778899' },
  { name: 'Анна Воропаева', email: 'anna_vorob@gmail.com', phone: '+375298889900' },
  { name: 'Игорь Каминский', email: 'igor_kam@yandex.by', phone: '+375299990011' },
  { name: 'Наталья Жук', email: 'natali_zhuk@tut.by', phone: '+375291234567' },
  { name: 'Павел Черняк', email: 'pavel_chernyak@gmail.com', phone: '+375292345678' },
  { name: 'Светлана Кравчук', email: 'sveta_krav@mail.ru', phone: '+375293456789' },
  { name: 'Виктор Кузьмич', email: 'victor_kuzm@gmail.com', phone: '+375294567890' },
  { name: 'Юлия Нестерович', email: 'yulia_nest@tut.by', phone: '+375295678901' },
  { name: 'Артем Макаров', email: 'artem_makar@gmail.com', phone: '+375296789012' },
  { name: 'Марина Василевская', email: 'marina_vas@yandex.by', phone: '+375297890123' }
];

async function seedRealisticAnalytics() {
  try {
    console.log('--- Генерация реалистичных аналитических данных для DelFarm ---');

    // 1. Находим ферму Ивана Полевого (или первую одобренную)
    const farm = await Farm.findOne({ where: { status: 'approved' } });
    if (!farm) {
      console.error('Ошибка: Одобренная ферма не найдена!');
      return;
    }
    console.log(`Наполняем данными ферму: "${farm.farm_name}" (ID: ${farm.farm_id})`);

    // 2. Создаем или получаем 16 клиентов в БД
    const createdClients = [];
    for (const c of REAL_CLIENTS) {
      let [u] = await User.findOrCreate({
        where: { email: c.email },
        defaults: {
          full_name: c.name,
          password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          phone_number: c.phone,
          role: 'client'
        }
      });
      createdClients.push(u);
    }

    // 3. Создаем адреса во всех 6 микрорайонах Гродно
    const addresses = [];
    for (let i = 0; i < createdClients.length; i++) {
      const client = createdClients[i];
      const district = GRODNO_DISTRICTS[i % GRODNO_DISTRICTS.length];
      const addr = await Address.create({
        user_id: client.user_id,
        address_line: `г. Гродно, мкрн ${district}, ул. Садовая, д. ${i + 1}`,
        district: district
      });
      addresses.push(addr);
    }

    // 4. Проверяем товары фермы и настраиваем критические остатки (Stock Alerts)
    let products = await Product.findAll({ where: { farm_id: farm.farm_id } });
    if (products.length < 3) {
      const cat = await Category.findOne() || await Category.create({ name: 'Молочные продукты' });
      products = [
        await Product.create({ farm_id: farm.farm_id, category_id: cat.category_id, name: 'Творог Домашний 9%', price: 9.60, unit: 'кг', stock_quantity: 3 }),
        await Product.create({ farm_id: farm.farm_id, category_id: cat.category_id, name: 'Сыр "Городенский Крафт"', price: 32.00, unit: 'кг', stock_quantity: 4 }),
        await Product.create({ farm_id: farm.farm_id, category_id: cat.category_id, name: 'Свежее молоко цельное', price: 3.50, unit: 'л', stock_quantity: 18 }),
        await Product.create({ farm_id: farm.farm_id, category_id: cat.category_id, name: 'Сливочное масло 82.5%', price: 14.50, unit: 'кг', stock_quantity: 2 })
      ];
    } else {
      // Задаем явные критические остатки (≤ 5) для 2 товаров, чтобы виджет Stock Alerts был заполнен!
      products[0].stock_quantity = 3;
      await products[0].save();
      if (products[1]) {
        products[1].stock_quantity = 4;
        await products[1].save();
      }
    }

    // 5. Очищаем старые тестовые заказы этой фермы для красивой статистики
    const oldOrders = await Order.findAll({
      include: [{
        model: Order_Items,
        where: { product_id: products.map(p => p.product_id) }
      }]
    });
    for (const o of oldOrders) {
      await Order_Items.destroy({ where: { order_id: o.order_id } });
      await o.destroy();
    }

    // 6. Генерируем ровно 46 реалистичных заказов за последние 30 дней
    const now = new Date();
    let totalGeneratedRevenue = 0;

    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const orderDate = new Date();
      orderDate.setDate(now.getDate() - dayOffset);

      // Всплески заказов в пятницу и субботу
      const dayOfWeek = orderDate.getDay();
      const isWeekendPeak = dayOfWeek === 5 || dayOfWeek === 6;
      const ordersToday = isWeekendPeak ? (dayOffset % 2 === 0 ? 3 : 2) : (dayOffset % 3 === 0 ? 2 : 1);

      for (let i = 0; i < ordersToday; i++) {
        const client = createdClients[Math.floor(Math.random() * createdClients.length)];
        const addr = addresses.find(a => a.user_id === client.user_id) || addresses[0];

        const order = await Order.create({
          user_id: client.user_id,
          address_id: addr.address_id,
          status: 'delivered',
          total_price: 0,
          payment_method: Math.random() > 0.4 ? 'card' : 'cash',
          created_at: orderDate
        });

        // Флагманский товар (Класс A по Парето)
        const hitProd = products[0];
        const hitQty = Math.floor(Math.random() * 2) + 2; // 2-3 шт.
        const rev1 = Number(hitProd.price) * hitQty;

        await Order_Items.create({
          order_id: order.order_id,
          product_id: hitProd.product_id,
          quantity: hitQty,
          price_per_unit: hitProd.price
        });

        let currentOrderTotal = rev1;

        // Дополнительный товар (Класс B или C)
        if (products.length > 1 && Math.random() > 0.35) {
          const secondProd = products[Math.floor(Math.random() * (products.length - 1)) + 1];
          const secondQty = 1;
          const rev2 = Number(secondProd.price) * secondQty;

          await Order_Items.create({
            order_id: order.order_id,
            product_id: secondProd.product_id,
            quantity: secondQty,
            price_per_unit: secondProd.price
          });

          currentOrderTotal += rev2;
        }

        order.total_price = currentOrderTotal;
        await order.save();
        totalGeneratedRevenue += currentOrderTotal;
      }
    }

    console.log(`\n УСПЕШНО СГЕНЕРИРОВАНО:`);
    console.log(`• Всего уникальных клиентов: ${createdClients.length} чел.`);
    console.log(`• Выполнено заказов за 30 дней: ~46 ед.`);
    console.log(`• Общая выручка хозяйства: ${totalGeneratedRevenue.toFixed(2)} BYN`);
    console.log(`• Средний чек: ~${(totalGeneratedRevenue / 46).toFixed(2)} BYN`);
    console.log(`• Товаров в критическом остатке (Stock Alerts): 2 позиции (по 3 и 4 шт.)`);

    process.exit(0);
  } catch (error) {
    console.error('Ошибка генерации:', error);
    process.exit(1);
  }
}

seedRealisticAnalytics();