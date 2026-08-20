import Product from "../models/Product.js";
import Category from "../models/categoryModel.js";

// Get all available products
export const getProducts = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, sort } = req.query;

    const filter = {
      isAvailable: true,
    };

    // Category filter
    if (category) {
      const categoryDoc = await Category.findOne({
        slug: category,
        isActive: true,
      });

      if (!categoryDoc) {
        return res.status(200).json({
          success: true,
          count: 0,
          products: [],
        });
      }

      filter.category = categoryDoc._id;
    }

    // Search filter
    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Price filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        filter.price.$gte = Number(minPrice);
      }

      if (maxPrice !== undefined) {
        filter.price.$lte = Number(maxPrice);
      }
    }

    // Sorting
    let sortOption = {
      dropNumber: 1,
    };

    if (sort === "price-low") {
      sortOption = { price: 1 };
    }

    if (sort === "price-high") {
      sortOption = { price: -1 };
    }

    if (sort === "newest") {
      sortOption = { createdAt: -1 };
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

// GET /api/products/:id
// Get single product
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
};

// POST /api/products
// Create product
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      category,
      dropNumber,
      image,
      ingredients,
      stock,
      isAvailable,
    } = req.body;

    if (
      !name ||
      !slug ||
      !description ||
      price === undefined ||
      !category ||
      dropNumber === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required product fields",
      });
    }

    const existingProduct = await Product.findOne({ slug });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product with this slug already exists",
      });
    }

    const product = await Product.create({
      name,
      slug,
      description,
      price,
      category,
      dropNumber,
      image,
      ingredients,
      stock,
      isAvailable,
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};

// PUT /api/products/:id
// Update product
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const {
      name,
      slug,
      description,
      price,
      category,
      dropNumber,
      image,
      ingredients,
      stock,
      isAvailable,
    } = req.body;

    if (slug && slug !== product.slug) {
      const existingProduct = await Product.findOne({
        slug,
        _id: { $ne: req.params.id },
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: "Another product with this slug already exists",
        });
      }
    }

    product.name = name ?? product.name;
    product.slug = slug ?? product.slug;
    product.description = description ?? product.description;
    product.price = price ?? product.price;
    product.category = category ?? product.category;
    product.dropNumber = dropNumber ?? product.dropNumber;
    product.image = image ?? product.image;
    product.ingredients = ingredients ?? product.ingredients;
    product.stock = stock ?? product.stock;
    product.isAvailable = isAvailable ?? product.isAvailable;

    const updatedProduct = await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Update product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};

// DELETE /api/products/:id
// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};